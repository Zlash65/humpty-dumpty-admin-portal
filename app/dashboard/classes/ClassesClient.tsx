'use client';

import { useCallback, useEffect, useMemo, useRef, useState, FormEvent, ChangeEvent } from 'react';
import {
    Box,
    Typography,
    Paper,
    Button,
    TextField,
    CircularProgress,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Grid,
    MenuItem,
    Alert,
    IconButton,
    Tooltip,
    Chip,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import {
    GridToolbarContainer,
    GridToolbarColumnsButton,
    GridToolbarFilterButton,
    GridToolbarDensitySelector,
    GridToolbarExport,
    GridColDef,
    GridRenderCellParams,
    GridColumnVisibilityModel,
    useGridApiRef,
} from '@mui/x-data-grid';
import { createFeeStructure, deleteFeeStructure, getFeeStructuresPage, updateFeeStructure } from '@/app/actions/feeStructure';
import { getUiSetting, setUiSetting } from '@/app/actions/uiSettings';
import StandardDataGrid from '@/components/StandardDataGrid';
import useServerPaginatedGrid from '@/components/ui/grid/useServerPaginatedGrid';
import ExportAllCsvButton from '@/components/ui/grid/ExportAllCsvButton';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { SHIFT_OPTIONS, parseUiShift, uiShiftFromDb, type UiShift } from '@/lib/shifts';

interface ClassEntry {
    _id: string;
    class: string;
    shiftName?: string;
    startTime?: string;
    endTime?: string;
    numDivisions?: number;
    components?: {
        term1?: number;
        term2?: number;
        bookFee?: number;
    };
}

interface ClassRow extends ClassEntry {
    srNo: number;
    class_name: string;
    shift_name: string;
    start_time: string;
    end_time: string;
    division_count: number;
    term1_fee: number;
    term2_fee: number;
    books_charge: number;
    total_fees: number;
}

interface Message {
    type: 'success' | 'error' | 'info' | 'warning';
    text: string;
}

interface ClassesClientProps {
    academicYearId: string;
    branchId: string;
    branchName?: string;
    yearName?: string;
    initialClassEntries?: ClassEntry[];
    initialClassEntryRowCount?: number;
}

const DEFAULT_COLUMN_VISIBILITY: GridColumnVisibilityModel = {
    srNo: true,
    class_name: true,
    shift_name: true,
    start_time: true,
    end_time: true,
    division_count: true,
    term1_fee: true,
    term2_fee: true,
    books_charge: true,
    total_fees: true,
};

function normalizeClassesColumnsModel(model: unknown): GridColumnVisibilityModel | null {
    if (!model || typeof model !== 'object') return null;
    const map: Record<string, string> = {
        class: 'class_name',
        shiftName: 'shift_name',
        startTime: 'start_time',
        endTime: 'end_time',
        numDivisions: 'division_count',
        term1: 'term1_fee',
        term2: 'term2_fee',
        bookFee: 'books_charge',
        total: 'total_fees',
    };
    const out = { ...(model as Record<string, boolean>) };
    for (const [oldKey, newKey] of Object.entries(map)) {
        if (Object.prototype.hasOwnProperty.call(out, oldKey) && !Object.prototype.hasOwnProperty.call(out, newKey)) {
            out[newKey] = out[oldKey];
        }
    }
    return out;
}

function classLabel(row: ClassRow | null): string {
    const shift = row?.shiftName ? ` \u2022 ${row.shiftName}` : '';
    return `${row?.class || ''}${shift}`;
}

export default function ClassesClient({
    academicYearId,
    branchId,
    branchName = '',
    yearName = '',
    initialClassEntries = [],
    initialClassEntryRowCount = 0,
}: ClassesClientProps) {
    const [message, setMessage] = useState<Message | null>(null);
    const [query, setQuery] = useState('');
    const apiRef = useGridApiRef();

    const fetchClassPage = useCallback(
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
            const res = await getFeeStructuresPage(academicYearId, branchId, search, page, pageSize, sortModel, filterModel);
            return {
                rows: Array.isArray(res?.rows) ? res.rows : [],
                total: Number(res?.total) || 0,
            };
        },
        [academicYearId, branchId]
    );

    const {
        rows,
        rowCount,
        paginationModel,
        setPaginationModel,
        sortModel,
        onSortModelChange,
        filterModel,
        onFilterModelChange,
        loading,
        searchActive,
        effectiveSearch,
        refresh: refreshRows,
    } = useServerPaginatedGrid<ClassEntry>({
        initialRows: initialClassEntries,
        initialRowCount: initialClassEntryRowCount,
        initialPaginationModel: { page: 0, pageSize: 5 },
        query,
        minChars: 2,
        debounceMs: 300,
        fetchPage: fetchClassPage,
    });

    const gridRows: ClassRow[] = useMemo(() => {
        const baseIndex = paginationModel.page * paginationModel.pageSize;
        return (rows || []).map((c, idx) => ({
            ...c,
            srNo: baseIndex + idx + 1,
            // Electron field ids (snake_case)
            class_name: c.class || '',
            shift_name: c.shiftName || '',
            start_time: c.startTime || '',
            end_time: c.endTime || '',
            division_count: Number(c.numDivisions) || 0,
            term1_fee: Number(c?.components?.term1) || 0,
            term2_fee: Number(c?.components?.term2) || 0,
            books_charge: Number(c?.components?.bookFee) || 0,
            total_fees:
                (Number(c?.components?.term1) || 0) +
                (Number(c?.components?.term2) || 0) +
                (Number(c?.components?.bookFee) || 0),
        }));
    }, [paginationModel.page, paginationModel.pageSize, rows]);

    useEffect(() => {
        if (gridRows.length > 0) {
            const timeout = setTimeout(() => {
                apiRef.current.autosizeColumns({
                    includeHeaders: true,
                    columns: ['srNo'],
                    includeOutliers: true,
                });
            }, 100);
            return () => clearTimeout(timeout);
        }
    }, [gridRows, apiRef]);

    const [addOpen, setAddOpen] = useState(false);
    const [editRow, setEditRow] = useState<ClassRow | null>(null);
    const [deleteRow, setDeleteRow] = useState<ClassRow | null>(null);

    const [columnVisibility, setColumnVisibility] = useState<GridColumnVisibilityModel>(DEFAULT_COLUMN_VISIBILITY);
    const persistTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastQueuedVisibilityRef = useRef(JSON.stringify(DEFAULT_COLUMN_VISIBILITY));
    const lastSavedVisibilityRef = useRef(JSON.stringify(DEFAULT_COLUMN_VISIBILITY));

    useEffect(() => {
        (async () => {
            try {
                const saved = await getUiSetting('classesTableSettings');
                const model = normalizeClassesColumnsModel((saved as { columnVisibilityModel?: unknown })?.columnVisibilityModel);
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
                await setUiSetting('classesTableSettings', { columnVisibilityModel: next }, 'general');
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

    const columns: GridColDef[] = useMemo(() => {
        const currency = (v: unknown): string => `\u20B9${Number(v || 0).toLocaleString('en-IN')}`;
        return [
            {
                field: 'srNo',
                headerName: 'Sr No',
                sortable: false,
                filterable: false,
                disableColumnMenu: true,
                headerAlign: 'center',
                align: 'center',
            },
            { field: 'class_name', headerName: 'Class', flex: 1, minWidth: 160 },
            { field: 'shift_name', headerName: 'Shift', flex: 1, minWidth: 140 },
            { field: 'start_time', headerName: 'Start', width: 110 },
            { field: 'end_time', headerName: 'End', width: 110 },
            { field: 'division_count', headerName: 'Divisions', width: 120, headerAlign: 'center', align: 'center', type: 'number' },
            { field: 'term1_fee', headerName: 'Term 1', width: 120, headerAlign: 'right', align: 'right', valueFormatter: (v) => currency((v as { value?: unknown })?.value ?? v) },
            { field: 'term2_fee', headerName: 'Term 2', width: 120, headerAlign: 'right', align: 'right', valueFormatter: (v) => currency((v as { value?: unknown })?.value ?? v) },
            { field: 'books_charge', headerName: 'Books', width: 120, headerAlign: 'right', align: 'right', valueFormatter: (v) => currency((v as { value?: unknown })?.value ?? v) },
            { field: 'total_fees', headerName: 'Total Fees', width: 140, headerAlign: 'right', align: 'right', valueFormatter: (v) => currency((v as { value?: unknown })?.value ?? v) },
            {
                field: '__actions',
                headerName: 'Actions',
                width: 140,
                sortable: false,
                filterable: false,
                hideable: false,
                headerAlign: 'center',
                align: 'center',
                renderCell: (params: GridRenderCellParams) => (
                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', height: '100%', justifyContent: 'center' }}>
                        <Tooltip title="Edit">
                            <IconButton
                                size="small"
                                onClick={() => setEditRow(params.row as ClassRow)}
                            >
                                <EditIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                            <IconButton
                                size="small"
                                color="error"
                                onClick={() => setDeleteRow(params.row as ClassRow)}
                            >
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                ),
            },
        ];
    }, []);

    function GridToolbar() {
        const fileName = `classes-${branchName || 'branch'}-${yearName || ''}`.trim().replace(/\s+/g, '-');
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
                        entity="classes"
                        filename={fileName}
                        disabled={loading}
                        payload={{
                            academicYearId,
                            branchId,
                            search: effectiveSearch,
                            sortModel,
                            filterModel,
                        }}
                        onError={(msg) => setMessage({ type: 'error', text: msg })}
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
            <Box sx={{
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'column', md: 'row' },
                justifyContent: 'space-between',
                alignItems: { xs: 'flex-start', md: 'flex-end' },
                gap: 2,
                mb: 2,
                minWidth: 0,
                width: '100%',
            }}>
                <Box sx={{ flex: 1, minWidth: 0, width: { xs: '100%', md: 'auto' } }}>
                    <Typography variant="h4" fontWeight="bold">Classes</Typography>
                    <Typography
                        variant="body2"
                        color="text.secondary"
                        noWrap
                        sx={{ minWidth: 0, maxWidth: '100%' }}
                    >
                        Class entries (fees/divisions) • {branchName} • {yearName}
                    </Typography>
                </Box>
                <Box sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    gap: 1.5,
                    flexWrap: 'wrap',
                    minWidth: 0,
                    width: { xs: '100%', sm: 'auto' },
                    maxWidth: { md: '60%' },
                    alignItems: { xs: 'stretch', sm: 'center' },
                }}>
                    <TextField
                        label="Branch"
                        value={branchName || '-'}
                        size="small"
                        InputProps={{ readOnly: true }}
                        sx={{ minWidth: 180, flex: { sm: '1 1 auto' } }}
                    />
                    <TextField
                        label="Year"
                        value={yearName || '-'}
                        size="small"
                        InputProps={{ readOnly: true }}
                        sx={{ minWidth: 140, flex: { sm: '1 1 auto' } }}
                    />
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => setAddOpen(true)}
                        sx={{
                            height: 40,
                            whiteSpace: 'nowrap',
                            minWidth: 'max-content',
                            px: 3,
                        }}
                    >
                        Add Class
                    </Button>
                </Box>
            </Box>

            {message && (
                <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
                    {message.text}
                </Alert>
            )}

            <Paper sx={{ p: { xs: 1.5, sm: 2 }, mb: 2, width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
                <TextField
                    id="classes-search"
                    value={query}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                    placeholder="Search class, shift (min 2 chars)..."
                    label="Search"
                    size="small"
                    sx={{ width: '100%', maxWidth: '100%' }}
                    slotProps={{
                        input: {
                            endAdornment: loading && searchActive ? <CircularProgress size={18} /> : undefined,
                        },
                    }}
                />
            </Paper>

            <StandardDataGrid
                apiRef={apiRef}
                rows={gridRows}
                columns={columns}
                getRowId={(row) => row._id}
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
                pageSizeOptions={[5, 10, 25, 50]}
                initialState={{ sorting: { sortModel: [{ field: 'srNo', sort: 'asc' }] } }}
                columnVisibilityModel={columnVisibility}
                onColumnVisibilityModelChange={queuePersistColumns}
                slots={{ toolbar: GridToolbar }}
            />

            <ClassEntryDialog
                mode="add"
                open={addOpen}
                onClose={() => setAddOpen(false)}
                academicYearId={academicYearId}
                branchId={branchId}
                onDone={(res) => {
                    if (res?.error) setMessage({ type: 'error', text: res.error });
                    else setMessage({ type: 'success', text: 'Class saved.' });
                    setAddOpen(false);
                    refreshRows();
                }}
            />

            <ClassEntryDialog
                mode="edit"
                open={!!editRow}
                onClose={() => setEditRow(null)}
                academicYearId={academicYearId}
                branchId={branchId}
                initial={editRow}
                onDone={(res) => {
                    if (res?.error) setMessage({ type: 'error', text: res.error });
                    else setMessage({ type: 'success', text: 'Class updated.' });
                    setEditRow(null);
                    refreshRows();
                }}
            />

            <Dialog open={!!deleteRow} onClose={() => setDeleteRow(null)}>
                <DialogTitle>Delete Class Entry</DialogTitle>
                <DialogContent dividers>
                    <Typography>
                        Delete <strong>{classLabel(deleteRow)}</strong>?
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        This does not delete students; it only removes the class fee definition for this year/branch.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteRow(null)}>Cancel</Button>
                    <Button
                        color="error"
                        variant="contained"
                        onClick={async () => {
                            const res = await deleteFeeStructure(deleteRow!._id);
                            if (res?.error) setMessage({ type: 'error', text: res.error });
                            else setMessage({ type: 'success', text: 'Class deleted.' });
                            setDeleteRow(null);
                            refreshRows();
                        }}
                    >
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

interface ClassEntryDialogProps {
    mode: 'add' | 'edit';
    open: boolean;
    onClose: () => void;
    academicYearId: string;
    branchId: string;
    initial?: ClassRow | null;
    onDone?: (res: { error?: string; success?: boolean }) => void;
}

function ClassEntryDialog({ mode, open, onClose, academicYearId, branchId, initial, onDone }: ClassEntryDialogProps) {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [shiftName, setShiftName] = useState<UiShift>(() => uiShiftFromDb(initial?.shiftName));

    useEffect(() => {
        if (!open) return;
        setError('');
        setSubmitting(false);
        setShiftName(uiShiftFromDb(initial?.shiftName));
    }, [open, initial?._id, initial?.shiftName]);

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');

        const formData = new FormData(e.currentTarget);
        formData.set('academicYearId', academicYearId);
        formData.set('branchId', branchId);

        try {
            const res =
                mode === 'edit'
                    ? await updateFeeStructure(initial!._id, formData)
                    : await createFeeStructure(formData);
            if (res?.error) {
                setError(res.error);
                onDone?.(res);
                return;
            }
            onDone?.({ success: true });
        } catch (err) {
            const msg = (err as Error)?.message || 'Failed to save class';
            setError(msg);
            onDone?.({ error: msg });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>{mode === 'edit' ? 'Edit Class' : 'Add Class'}</DialogTitle>
            <Box component="form" onSubmit={handleSubmit}>
                <DialogContent dividers>
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField name="class" label="Class" fullWidth required defaultValue={initial?.class || ''} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <SearchableSelect
                                id="class-shift"
                                name="shiftName"
                                label="Shift"
                                placeholder="Select shift"
                                value={shiftName}
                                onChange={(next) => setShiftName(parseUiShift(next) || 'Morning')}
                                options={SHIFT_OPTIONS}
                                required
                                disableClearable
                                listboxMaxHeight={240}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField
                                name="numDivisions"
                                label="Divisions"
                                type="number"
                                inputProps={{ min: 1, step: 1 }}
                                fullWidth
                                defaultValue={initial?.numDivisions || 1}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField name="startTime" label="Start Time (Optional)" fullWidth defaultValue={initial?.startTime || ''} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField name="endTime" label="End Time (Optional)" fullWidth defaultValue={initial?.endTime || ''} />
                        </Grid>

                        <Grid size={{ xs: 12 }}>
                            <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1 }}>Fees</Typography>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField name="term1" label="Term 1" type="number" inputProps={{ min: 0, step: 0.01 }} fullWidth defaultValue={initial?.components?.term1 ?? 0} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField name="term2" label="Term 2" type="number" inputProps={{ min: 0, step: 0.01 }} fullWidth defaultValue={initial?.components?.term2 ?? 0} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField name="bookFee" label="Books" type="number" inputProps={{ min: 0, step: 0.01 }} fullWidth defaultValue={initial?.components?.bookFee ?? 0} />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose} disabled={submitting}>Cancel</Button>
                    <Button type="submit" variant="contained" disabled={submitting}>
                        {submitting ? 'Saving...' : mode === 'edit' ? 'Save' : 'Add'}
                    </Button>
                </DialogActions>
            </Box>
        </Dialog>
    );
}
