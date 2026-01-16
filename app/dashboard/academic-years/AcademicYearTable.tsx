'use client';

import { useState, FormEvent, useEffect, useRef, useMemo, useCallback } from 'react';
import { getAcademicYearsPage, setActiveYear, deleteAcademicYear, updateAcademicYear, lockAcademicYear } from '@/app/actions/academicYear';
import { getUiSetting, setUiSetting } from '@/app/actions/uiSettings';
import {
    IconButton,
    Typography,
    Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Alert,
    Chip,
    Box,
    TextField,
    Grid,
} from '@mui/material';
import {
    GridToolbarContainer,
    GridToolbarColumnsButton,
    GridToolbarFilterButton,
    GridToolbarDensitySelector,
    GridToolbarExport,
    GridColDef,
    GridColumnVisibilityModel,
    useGridApiRef
} from '@mui/x-data-grid';
import { Edit, Delete, CheckCircle, Lock, LockOpen } from '@mui/icons-material';
import StandardDataGrid from '@/components/StandardDataGrid';
import useServerPaginatedGrid from '@/components/ui/grid/useServerPaginatedGrid';
import ExportAllCsvButton from '@/components/ui/grid/ExportAllCsvButton';

interface AcademicYear {
    _id: string;
    name?: string;
    startDate?: string;
    endDate?: string;
    isActive?: boolean;
    isLocked?: boolean;
}

interface AcademicYearTableProps {
    initialYears: AcademicYear[];
    initialYearRowCount?: number;
}

interface Message {
    type: 'success' | 'error' | 'info' | 'warning';
    text: string;
}

function formatDate(dateStr: string | undefined): string {
    if (!dateStr) return '-';
    // Treat date-only values (YYYY-MM-DD) as local time to avoid off-by-one shifts.
    const date = (() => {
        const s = String(dateStr);
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        return new Date(s);
    })();
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

const DEFAULT_COLUMN_VISIBILITY: GridColumnVisibilityModel = {
    srNo: true,
    name: true,
    startDate: true,
    endDate: true,
    __status: true,
};

function normalizeAcademicYearsColumnsModel(model: unknown): GridColumnVisibilityModel | null {
    if (!model || typeof model !== 'object') return null;
    const map: Record<string, string> = {
        academicYear: 'name',
        start: 'startDate',
        end: 'endDate',
        status: '__status',
    };
    const out = { ...(model as Record<string, boolean>) };
    for (const [oldKey, newKey] of Object.entries(map)) {
        if (Object.prototype.hasOwnProperty.call(out, oldKey) && !Object.prototype.hasOwnProperty.call(out, newKey)) {
            out[newKey] = out[oldKey];
        }
    }
    return out;
}

export default function AcademicYearTable({ initialYears, initialYearRowCount = 0 }: AcademicYearTableProps) {
    const [query, setQuery] = useState('');
    const [editYear, setEditYear] = useState<AcademicYear | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<AcademicYear | null>(null);
    const [activateConfirm, setActivateConfirm] = useState<AcademicYear | null>(null);
    const [message, setMessage] = useState<Message | null>(null);
    const [loading, setLoading] = useState(false);

    const apiRef = useGridApiRef();

    const fetchYearPage = useCallback(
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
            const res = await getAcademicYearsPage({ search, page, pageSize, sortModel, filterModel });
            return { rows: res.rows, total: res.total };
        },
        []
    );

    const {
        rows: years,
        rowCount,
        paginationModel,
        setPaginationModel,
        sortModel,
        onSortModelChange,
        filterModel,
        onFilterModelChange,
        loading: gridLoading,
        searchActive,
        effectiveSearch,
        refresh: refreshRows,
    } = useServerPaginatedGrid<AcademicYear>({
        initialRows: initialYears,
        initialRowCount: initialYearRowCount,
        initialPaginationModel: { page: 0, pageSize: 10 },
        query,
        fetchPage: fetchYearPage,
    });

    const gridRows = useMemo(() => {
        const baseIndex = paginationModel.page * paginationModel.pageSize;
        return (years || []).map((y, idx) => ({ ...y, srNo: baseIndex + idx + 1 }));
    }, [paginationModel.page, paginationModel.pageSize, years]);

    const [columnVisibility, setColumnVisibility] = useState<GridColumnVisibilityModel>(DEFAULT_COLUMN_VISIBILITY);
    const persistTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastQueuedVisibilityRef = useRef(JSON.stringify(DEFAULT_COLUMN_VISIBILITY));
    const lastSavedVisibilityRef = useRef(JSON.stringify(DEFAULT_COLUMN_VISIBILITY));

    useEffect(() => {
        (async () => {
            try {
                const saved = await getUiSetting('academicYearsTableSettings');
                const model = normalizeAcademicYearsColumnsModel((saved as { columnVisibilityModel?: unknown })?.columnVisibilityModel);
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
                await setUiSetting('academicYearsTableSettings', { columnVisibilityModel: next }, 'general');
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

    const handleSetActive = async () => {
        if (!activateConfirm) return;
        setLoading(true);
        const res = await setActiveYear(activateConfirm._id);
        if (res.error) {
            setMessage({ type: 'error', text: res.error });
        } else {
            setMessage({ type: 'success', text: `${activateConfirm.name} is now the active year` });
            refreshRows();
        }
        setActivateConfirm(null);
        setLoading(false);
    };

    const handleDelete = async () => {
        if (!deleteConfirm) return;
        setLoading(true);
        const res = await deleteAcademicYear(deleteConfirm._id);
        if (res.error) {
            setMessage({ type: 'error', text: res.error });
        } else {
            setMessage({ type: 'success', text: 'Academic year deleted successfully' });
            refreshRows();
        }
        setDeleteConfirm(null);
        setLoading(false);
    };

    const handleUpdate = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!editYear) return;
        setLoading(true);
        const formData = new FormData(e.currentTarget);
        const res = await updateAcademicYear(editYear._id, formData);
        if (res.error) {
            setMessage({ type: 'error', text: res.error });
        } else {
            setMessage({ type: 'success', text: 'Academic year updated successfully' });
            setEditYear(null);
            refreshRows();
        }
        setLoading(false);
    };

    const handleToggleLock = async (year: AcademicYear) => {
        setLoading(true);
        const res = await lockAcademicYear(year._id, !year.isLocked);
        if (res.error) {
            setMessage({ type: 'error', text: res.error });
        } else {
            setMessage({ type: 'success', text: `Academic year ${year.isLocked ? 'unlocked' : 'locked'}` });
            refreshRows();
        }
        setLoading(false);
    };

    function GridToolbar() {
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
                        entity="academic-years"
                        filename="academic-years"
                        disabled={gridLoading}
                        payload={{
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
                        csvOptions={{ fileName: 'academic-years', utf8WithBom: true }}
                        printOptions={{ disableToolbarButton: true }}
                        slotProps={{ button: { size: 'small' } }}
                    />
                </Box>
            </GridToolbarContainer>
        );
    }

    const showEmptyState = rowCount === 0 && !searchActive;

    const columns: GridColDef[] = [
        {
            field: 'srNo',
            headerName: 'Sr No',
            width: 100,
            headerAlign: 'center',
            align: 'center',
            disableColumnMenu: true,
        },
        {
            field: 'name',
            headerName: 'Name',
            flex: 1.2,
            minWidth: 200,
            renderCell: (params) => (
                <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                    <Tooltip title={params.row?.name || ''}>
                        <span
                            style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: '100%',
                            }}
                        >
                            {params.row?.name}
                        </span>
                    </Tooltip>
                </Box>
            ),
        },
        {
            field: 'startDate',
            headerName: 'Start Date',
            flex: 0.8,
            minWidth: 140,
            headerAlign: 'center',
            align: 'center',
            valueGetter: (_value, row) => formatDate(row?.startDate),
        },
        {
            field: 'endDate',
            headerName: 'End Date',
            flex: 0.8,
            minWidth: 140,
            headerAlign: 'center',
            align: 'center',
            valueGetter: (_value, row) => formatDate(row?.endDate),
        },
        {
            field: '__status',
            headerName: 'Status',
            flex: 1,
            minWidth: 160,
            sortable: false,
            filterable: false,
            headerAlign: 'center',
            align: 'center',
            renderCell: (params) => {
                const year = params.row as AcademicYear;
                return (
                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', height: '100%', justifyContent: 'center' }}>
                        {year?.isActive ? (
                            <Chip label="Active" color="success" size="small" />
                        ) : (
                            <Chip label="Inactive" size="small" variant="outlined" />
                        )}
                        {year?.isLocked && (
                            <Chip
                                label="Locked"
                                size="small"
                                color="warning"
                                icon={<Lock fontSize="small" />}
                            />
                        )}
                    </Box>
                );
            },
        },
        {
            field: '__actions',
            headerName: 'Actions',
            width: 160,
            headerAlign: 'center',
            align: 'center',
            sortable: false,
            filterable: false,
            hideable: false,
            renderCell: (params) => {
                const year = params.row as AcademicYear;
                return (
                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', height: '100%', justifyContent: 'center' }}>
                        {!year?.isActive && (
                            <Tooltip title="Set as Active">
                                <IconButton
                                    size="small"
                                    color="success"
                                    onClick={() => setActivateConfirm(year)}
                                    disabled={loading}
                                >
                                    <CheckCircle fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}
                        <Tooltip title={year?.isLocked ? 'Unlock' : 'Lock'}>
                            <IconButton
                                size="small"
                                onClick={() => handleToggleLock(year)}
                                disabled={loading}
                            >
                                {year?.isLocked ? <LockOpen fontSize="small" /> : <Lock fontSize="small" />}
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit">
                            <IconButton
                                size="small"
                                onClick={() => setEditYear(year)}
                                disabled={year?.isLocked || loading}
                            >
                                <Edit fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                            <IconButton
                                size="small"
                                color="error"
                                onClick={() => setDeleteConfirm(year)}
                                disabled={year?.isActive || year?.isLocked || loading}
                            >
                                <Delete fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                );
            },
        },
    ];

    return (
        <>
            {message && (
                <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
                    {message.text}
                </Alert>
            )}

            <Box
                sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 1,
                    rowGap: 1,
                    alignItems: 'center',
                    mb: 2,
                    minWidth: 0,
                    width: '100%',
                }}
            >
                <TextField
                    size="small"
                    label="Search"
                    placeholder="Search by name, date, status (min 2 chars)..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    sx={{ minWidth: { xs: '100%', sm: 360 } }}
                />
                {gridLoading && searchActive && <Chip size="small" label="Searching..." />}
            </Box>

            {showEmptyState && (
                <Typography color="text.secondary" sx={{ mb: 2 }}>
                    No academic years found. Create your first one above.
                </Typography>
            )}

            <StandardDataGrid
                apiRef={apiRef}
                rows={gridRows}
                getRowId={(row) => row._id}
                autoHeight
                loading={gridLoading}
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
                columns={columns}
                initialState={{ sorting: { sortModel: [{ field: 'srNo', sort: 'asc' }] } }}
                columnVisibilityModel={columnVisibility}
                onColumnVisibilityModelChange={queuePersistColumns}
                slots={{ toolbar: GridToolbar }}
                sx={{
                    '& .MuiDataGrid-columnHeaders': { bgcolor: 'grey.100' },
                }}
            />

            {/* Activate Confirmation Dialog */}
            <Dialog open={!!activateConfirm} onClose={() => setActivateConfirm(null)}>
                <DialogTitle>Set Active Year</DialogTitle>
                <DialogContent dividers>
                    Are you sure you want to set <strong>{activateConfirm?.name}</strong> as the active academic year?
                    This will deactivate the current active year.
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setActivateConfirm(null)} disabled={loading}>Cancel</Button>
                    <Button onClick={handleSetActive} color="success" variant="contained" disabled={loading}>
                        {loading ? 'Setting...' : 'Set Active'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Edit Year Dialog */}
            <Dialog open={!!editYear} onClose={() => setEditYear(null)} maxWidth="sm" fullWidth>
                <Box component="form" onSubmit={handleUpdate}>
                    <DialogTitle>Edit Academic Year</DialogTitle>
                    <DialogContent dividers>
                        <Grid container spacing={2} sx={{ mt: 0.5 }}>
                            <Grid size={{ xs: 12 }}>
                                <TextField
                                    name="name"
                                    label="Name"
                                    fullWidth
                                    required
                                    defaultValue={editYear?.name}
                                    placeholder="e.g., 2024-2025"
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                    name="startDate"
                                    label="Start Date"
                                    type="date"
                                    fullWidth
                                    required
                                    defaultValue={editYear?.startDate?.split('T')[0]}
                                    slotProps={{ inputLabel: { shrink: true } }}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                    name="endDate"
                                    label="End Date"
                                    type="date"
                                    fullWidth
                                    required
                                    defaultValue={editYear?.endDate?.split('T')[0]}
                                    slotProps={{ inputLabel: { shrink: true } }}
                                />
                            </Grid>
                        </Grid>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setEditYear(null)} disabled={loading}>Cancel</Button>
                        <Button type="submit" variant="contained" disabled={loading}>
                            {loading ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </DialogActions>
                </Box>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
                <DialogTitle>Confirm Delete</DialogTitle>
                <DialogContent dividers>
                    Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>?
                    This action cannot be undone.
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteConfirm(null)} disabled={loading}>Cancel</Button>
                    <Button onClick={handleDelete} color="error" variant="contained" disabled={loading}>
                        {loading ? 'Deleting...' : 'Delete'}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
