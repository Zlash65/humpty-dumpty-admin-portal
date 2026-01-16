'use client';

import EnrollStudentForm from './EnrollStudentForm';
import {
    Box,
    Typography,
    Paper,
    TextField,
    IconButton,
    Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
    Button,
    Alert,
    Grid,
} from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import {
    GridColDef,
    useGridApiRef,
    GridToolbarContainer,
    GridToolbarColumnsButton,
    GridToolbarFilterButton,
    GridToolbarDensitySelector,
    GridToolbarExport,
    GridRenderCellParams,
    GridColumnVisibilityModel,
} from '@mui/x-data-grid';
import { useCallback, useEffect, useMemo, useRef, useState, FormEvent, ChangeEvent } from 'react';
import { getEnrollmentsPage, updateEnrollment, deleteEnrollment } from '@/app/actions/enrollment';
import { getUiSetting, setUiSetting } from '@/app/actions/uiSettings';
import StandardDataGrid from '@/components/StandardDataGrid';
import useServerPaginatedGrid from '@/components/ui/grid/useServerPaginatedGrid';
import ExportAllCsvButton from '@/components/ui/grid/ExportAllCsvButton';
import SearchableSelect, { type SearchableSelectOption } from '@/components/ui/SearchableSelect';
import { divisionsFromCount } from '@/lib/divisions';

interface AcademicYear {
    _id: string;
    name?: string;
}

interface ClassEntry {
    _id: string;
    class: string;
    shiftName?: string;
    numDivisions?: number;
}

interface Enrollment {
    _id: string;
    class?: string;
    division?: string;
    rollNumber?: string;
    shiftName?: string;
    studentId?: {
        _id?: string;
        admissionNumber?: string;
        firstName?: string;
        lastName?: string;
    };
}

export interface EnrollmentClientProps {
    years: AcademicYear[];
    academicYearId: string;
    branchId: string;
    yearName?: string;
    classEntries?: ClassEntry[];
    initialEnrollments: Enrollment[];
    initialEnrollmentRowCount?: number;
}

const DEFAULT_COLUMN_VISIBILITY: GridColumnVisibilityModel = {
    srNo: true,
    class: true,
    division: true,
    rollNumber: true,
    admissionNumber: true,
    name: true,
};

function normalizeEnrollmentColumnsModel(model: unknown): GridColumnVisibilityModel | null {
    if (!model || typeof model !== 'object') return null;
    return { ...(model as Record<string, boolean>) };
}

export default function EnrollmentClient({
    years,
    academicYearId,
    branchId,
    yearName,
    classEntries = [],
    initialEnrollments,
    initialEnrollmentRowCount = 0,
}: EnrollmentClientProps) {
    const apiRef = useGridApiRef();
    const persistTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastQueuedVisibilityRef = useRef(JSON.stringify(DEFAULT_COLUMN_VISIBILITY));
    const lastSavedVisibilityRef = useRef(JSON.stringify(DEFAULT_COLUMN_VISIBILITY));

    const [columnVisibility, setColumnVisibility] = useState<GridColumnVisibilityModel>(DEFAULT_COLUMN_VISIBILITY);
    const [editRow, setEditRow] = useState<{ id: string; class: string; shiftName: string; division: string; rollNumber: string; name: string } | null>(null);
    const [deleteRow, setDeleteRow] = useState<{ id: string; name: string } | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const saved = await getUiSetting('enrollmentTableSettings');
                const model = normalizeEnrollmentColumnsModel((saved as { columnVisibilityModel?: unknown })?.columnVisibilityModel);
                if (model && typeof model === 'object') {
                    setColumnVisibility((prev) => {
                        const next = { ...prev, ...model };
                        const json = JSON.stringify(next);
                        lastQueuedVisibilityRef.current = json;
                        lastSavedVisibilityRef.current = json;
                        return next;
                    });
                }
            } catch {
                // ignore
            }
        })();
    }, []);

    const queuePersistColumns = (next: GridColumnVisibilityModel) => {
        setColumnVisibility(next);
        const json = JSON.stringify(next);
        lastQueuedVisibilityRef.current = json;
        if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        persistTimerRef.current = setTimeout(async () => {
            if (lastSavedVisibilityRef.current === json) return;
            if (lastQueuedVisibilityRef.current !== json) return;
            try {
                await setUiSetting('enrollmentTableSettings', { columnVisibilityModel: next }, 'general');
                lastSavedVisibilityRef.current = json;
            } catch {
                // ignore
            }
        }, 600);
    };

    useEffect(() => {
        return () => {
            if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        };
    }, []);

    const fetchEnrollmentPage = useCallback(
        async ({
            page,
            pageSize,
            search,
            sortModel,
            filterModel,
        }: {
            page: number;
            pageSize: number;
            search: string;
            sortModel: any;
            filterModel: any;
        }) => {
            const res = await getEnrollmentsPage({ academicYearId, branchId, search, page, pageSize, sortModel, filterModel });
            return {
                rows: Array.isArray(res?.rows) ? res.rows : [],
                total: Number(res?.total) || 0,
            };
        },
        [academicYearId, branchId]
    );

    const {
        rows: enrollments,
        rowCount,
        paginationModel,
        setPaginationModel,
        sortModel,
        onSortModelChange,
        filterModel,
        onFilterModelChange,
        loading,
        effectiveSearch,
        refresh: refreshRows,
    } = useServerPaginatedGrid<Enrollment>({
        initialRows: initialEnrollments,
        initialRowCount: initialEnrollmentRowCount,
        initialPaginationModel: { page: 0, pageSize: 10 },
        query: '',
        minChars: 2,
        debounceMs: 300,
        fetchPage: fetchEnrollmentPage,
    });

    const rows = useMemo(() => {
        const baseIndex = paginationModel.page * paginationModel.pageSize;
        return enrollments.map((enr, index) => ({
            id: enr._id,
            srNo: baseIndex + index + 1,
            class: enr.class || '-',
            division: enr.division || '-',
            rollNumber: enr.rollNumber || '-',
            admissionNumber: enr.studentId?.admissionNumber || '-',
            name: `${enr.studentId?.firstName || ''} ${enr.studentId?.lastName || ''}`.trim(),
            shiftName: enr.shiftName || '',
        }));
    }, [enrollments, paginationModel.page, paginationModel.pageSize]);

    const selectedYearName = yearName || years.find((y) => y._id === academicYearId)?.name || 'None';

    const columns: GridColDef[] = [
        {
            field: 'srNo',
            headerName: 'Sr No',
            width: 100,
            sortable: false,
            filterable: false,
            disableColumnMenu: true,
            headerAlign: 'center',
            align: 'center',
        },
        {
            field: 'class',
            headerName: 'Class',
            flex: 1,
            minWidth: 140,
            headerAlign: 'center',
            align: 'center',
            renderCell: (params: GridRenderCellParams) => (
                <Tooltip title={params.value || ''}>
                    <span
                        style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '100%',
                        }}
                    >
                        {params.value || ''}
                    </span>
                </Tooltip>
            ),
        },
        {
            field: 'division',
            headerName: 'Division',
            flex: 1,
            minWidth: 140,
            headerAlign: 'center',
            align: 'center',
            renderCell: (params: GridRenderCellParams) => (
                <Tooltip title={params.value || ''}>
                    <span
                        style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '100%',
                        }}
                    >
                        {params.value || ''}
                    </span>
                </Tooltip>
            ),
        },
        {
            field: 'rollNumber',
            headerName: 'Roll No',
            flex: 1,
            minWidth: 140,
            headerAlign: 'center',
            align: 'center',
            renderCell: (params: GridRenderCellParams) => (
                <Tooltip title={params.value || ''}>
                    <span
                        style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '100%',
                        }}
                    >
                        {params.value || ''}
                    </span>
                </Tooltip>
            ),
        },
        {
            field: 'admissionNumber',
            headerName: 'Admission No',
            flex: 1,
            minWidth: 160,
            headerAlign: 'center',
            align: 'center',
            renderCell: (params: GridRenderCellParams) => (
                <Tooltip title={params.value || ''}>
                    <span
                        style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '100%',
                        }}
                    >
                        {params.value || ''}
                    </span>
                </Tooltip>
            ),
        },
        {
            field: 'name',
            headerName: 'Name',
            flex: 1.2,
            minWidth: 200,
            renderCell: (params: GridRenderCellParams) => (
                <Tooltip title={params.value || ''}>
                    <span
                        style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '100%',
                        }}
                    >
                        {params.value || ''}
                    </span>
                </Tooltip>
            ),
        },
        {
            field: '__actions',
            headerName: 'Actions',
            width: 140,
            sortable: false,
            filterable: false,
            hideable: false,
            headerAlign: 'center',
            align: 'center',
            renderCell: (params: GridRenderCellParams) => {
                const row = params.row as { id: string; class: string; shiftName: string; division: string; rollNumber: string; name: string };
                return (
                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', height: '100%', justifyContent: 'center' }}>
                        <Tooltip title="Edit">
                            <IconButton
                                size="small"
                                onClick={() => setEditRow(row)}
                            >
                                <EditIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                            <IconButton
                                size="small"
                                color="error"
                                onClick={() => setDeleteRow({ id: row.id, name: row.name })}
                            >
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                );
            },
        },
    ];

    function GridToolbar() {
        const fileName = `enrollment-${selectedYearName || ''}`.trim().replace(/\s+/g, '-');
        return (
            <GridToolbarContainer
                sx={{
                    p: 1,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 1,
                    rowGap: 1,
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minWidth: 0,
                }}
            >
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', minWidth: 0 }}>
                    <GridToolbarColumnsButton />
                    <GridToolbarFilterButton />
                    <GridToolbarDensitySelector />
                    <ExportAllCsvButton
                        entity="enrollment"
                        filename={fileName}
                        disabled={loading}
                        payload={{
                            academicYearId,
                            branchId,
                            search: effectiveSearch,
                            sortModel,
                            filterModel,
                        }}
                    />
                </Box>
                <Box
                    sx={{
                        width: { xs: '100%', sm: 'auto' },
                        display: 'flex',
                        justifyContent: { xs: 'flex-start', sm: 'flex-end' },
                    }}
                >
                    <GridToolbarExport
                        csvOptions={{ fileName, utf8WithBom: true }}
                        printOptions={{ disableToolbarButton: true }}
                        slotProps={{ button: { size: 'small' } }}
                    />
                </Box>
            </GridToolbarContainer>
        );
    }

    return (
        <Box sx={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
            <Typography variant="h4" gutterBottom fontWeight="bold">
                Enrollment Management
            </Typography>

            {message && (
                <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
                    {message.text}
                </Alert>
            )}

            <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 4, width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
                <Typography variant="h6" gutterBottom>
                    Enroll Student
                </Typography>
                <EnrollStudentForm
                    academicYearId={academicYearId}
                    branchId={branchId}
                    classEntries={classEntries}
                    onEnrolled={refreshRows}
                />
            </Paper>

            <Box
                sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    justifyContent: { xs: 'flex-start', sm: 'space-between' },
                    alignItems: { xs: 'flex-start', sm: 'center' },
                    gap: 2,
                    mb: 2,
                    mt: 4,
                    minWidth: 0,
                    width: '100%',
                }}
            >
                <Typography variant="h5">Class Lists</Typography>
                <TextField label="Viewing Year" value={selectedYearName} size="small" InputProps={{ readOnly: true }} sx={{ minWidth: 200 }} />
            </Box>

            <StandardDataGrid
                apiRef={apiRef}
                rows={rows}
                columns={columns}
                autoHeight
                loading={loading}
                paginationMode="server"
                sortingMode="server"
                sortModel={sortModel}
                onSortModelChange={onSortModelChange}
                filterMode="server"
                filterModel={filterModel}
                onFilterModelChange={onFilterModelChange}
                rowCount={rowCount}
                paginationModel={paginationModel}
                onPaginationModelChange={setPaginationModel}
                pageSizeOptions={[10, 25, 50]}
                initialState={{ sorting: { sortModel: [{ field: 'srNo', sort: 'asc' }] } }}
                columnVisibilityModel={columnVisibility}
                onColumnVisibilityModelChange={queuePersistColumns}
                slots={{ toolbar: GridToolbar }}
            />

            {/* Edit Enrollment Dialog */}
            <EditEnrollmentDialog
                open={!!editRow}
                enrollment={editRow}
                classEntries={classEntries}
                onClose={() => setEditRow(null)}
                onSave={async (data) => {
                    if (!editRow) return;
                    const res = await updateEnrollment(editRow.id, data);
                    if (res.error) {
                        setMessage({ type: 'error', text: res.error });
                    } else {
                        setMessage({ type: 'success', text: 'Enrollment updated successfully.' });
                        refreshRows();
                    }
                    setEditRow(null);
                }}
            />

            {/* Delete Enrollment Dialog */}
            <Dialog open={!!deleteRow} onClose={() => setDeleteRow(null)}>
                <DialogTitle>Delete Enrollment</DialogTitle>
                <DialogContent dividers>
                    <DialogContentText>
                        Are you sure you want to delete the enrollment for <strong>{deleteRow?.name}</strong>?
                        This will also delete any associated fee records.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteRow(null)}>Cancel</Button>
                    <Button
                        color="error"
                        variant="contained"
                        onClick={async () => {
                            if (!deleteRow) return;
                            const res = await deleteEnrollment(deleteRow.id);
                            if (res.error) {
                                setMessage({ type: 'error', text: res.error });
                            } else {
                                setMessage({ type: 'success', text: 'Enrollment deleted successfully.' });
                                refreshRows();
                            }
                            setDeleteRow(null);
                        }}
                    >
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

interface EditEnrollmentDialogProps {
    open: boolean;
    enrollment: { id: string; class: string; shiftName: string; division: string; rollNumber: string; name: string } | null;
    classEntries: ClassEntry[];
    onClose: () => void;
    onSave: (data: { feeStructureId: string; division: string; rollNumber: string }) => Promise<void>;
}

function EditEnrollmentDialog({ open, enrollment, classEntries, onClose, onSave }: EditEnrollmentDialogProps) {
    const [feeStructureId, setFeeStructureId] = useState('');
    const [division, setDivision] = useState('');
    const [rollNumber, setRollNumber] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const classOptions = useMemo<SearchableSelectOption[]>(() => {
        return (classEntries || [])
            .map((c) => {
                const shift = c.shiftName ? ` \u2022 ${c.shiftName}` : '';
                const label = `${c.class || ''}${shift}`.trim();
                return {
                    value: String(c._id),
                    label,
                    keywords: `${c.class || ''} ${c.shiftName || ''}`.trim(),
                };
            })
            .filter((o) => Boolean(o.label));
    }, [classEntries]);

    const selectedEntry = useMemo(() => {
        return (classEntries || []).find((c) => String(c._id) === String(feeStructureId)) || null;
    }, [classEntries, feeStructureId]);

    const divisionOptions = useMemo<SearchableSelectOption[]>(() => {
        if (!selectedEntry) return [];
        return divisionsFromCount(selectedEntry.numDivisions || 1).map((d) => ({ value: d, label: d }));
    }, [selectedEntry]);

    useEffect(() => {
        if (!open || !enrollment) return;
        const cls = enrollment.class === '-' ? '' : enrollment.class;
        const shift = enrollment.shiftName || '';
        const match = (classEntries || []).find((c) => c.class === cls && (c.shiftName || '') === shift) || null;
        const initialFeeStructureId = match?._id ? String(match._id) : '';
        setFeeStructureId(initialFeeStructureId);

        const initialDivision = enrollment.division === '-' ? '' : enrollment.division;
        const fallbackDivision = match ? (divisionsFromCount(match.numDivisions || 1)[0] || '') : '';
        setDivision(initialDivision || fallbackDivision);

        setRollNumber(enrollment.rollNumber === '-' ? '' : enrollment.rollNumber);
        setError('');
        setSubmitting(false);
    }, [open, enrollment, classEntries]);

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!feeStructureId || !division) {
            setError('Class and Division are required');
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            await onSave({ feeStructureId, division, rollNumber });
        } catch {
            setError('Failed to update enrollment');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Edit Enrollment - {enrollment?.name}</DialogTitle>
            <Box component="form" onSubmit={handleSubmit}>
                <DialogContent dividers>
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <SearchableSelect
                                label="Class"
                                placeholder="Select class"
                                value={feeStructureId}
                                onChange={(next) => {
                                    setFeeStructureId(next);
                                    const entry = (classEntries || []).find((c) => String(c._id) === String(next)) || null;
                                    const nextDivision = divisionsFromCount(entry?.numDivisions || 1)[0] || 'A';
                                    setDivision(nextDivision);
                                }}
                                options={classOptions}
                                required
                                disableClearable
                                listboxMaxHeight={360}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 3 }}>
                            <SearchableSelect
                                label="Division"
                                placeholder="Select"
                                value={division}
                                onChange={(next) => setDivision(next)}
                                options={divisionOptions}
                                required
                                disableClearable
                                disabled={!feeStructureId || divisionOptions.length === 0}
                                listboxMaxHeight={240}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 3 }}>
                            <TextField
                                label="Roll No"
                                fullWidth
                                value={rollNumber}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setRollNumber(e.target.value)}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose} disabled={submitting}>Cancel</Button>
                    <Button type="submit" variant="contained" disabled={submitting}>
                        {submitting ? 'Saving...' : 'Save'}
                    </Button>
                </DialogActions>
            </Box>
        </Dialog>
    );
}
