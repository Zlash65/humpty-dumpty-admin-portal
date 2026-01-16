'use client';

import { useState, FormEvent, useEffect, useRef, useMemo, useCallback } from 'react';
import { deleteBranch, getBranchesPage, updateBranch } from '@/app/actions/branch';
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
    TextField,
    Grid,
    Box,
} from '@mui/material';
import {
    GridColDef,
    useGridApiRef,
    GridToolbarContainer,
    GridToolbarColumnsButton,
    GridToolbarFilterButton,
    GridToolbarDensitySelector,
    GridToolbarExport,
    GridColumnVisibilityModel,
} from '@mui/x-data-grid';
import { Edit, Delete, Phone, Email, LocationOn } from '@mui/icons-material';
import { getUiSetting, setUiSetting } from '@/app/actions/uiSettings';
import StandardDataGrid from '@/components/StandardDataGrid';
import useServerPaginatedGrid from '@/components/ui/grid/useServerPaginatedGrid';
import ExportAllCsvButton from '@/components/ui/grid/ExportAllCsvButton';

interface Branch {
    _id: string;
    name?: string;
    code?: string;
    contact?: string;
    email?: string;
    address?: string;
    isActive?: boolean;
}

interface BranchTableProps {
    initialBranches: Branch[];
    initialBranchRowCount?: number;
}

interface Message {
    type: 'success' | 'error' | 'info' | 'warning';
    text: string;
}

const DEFAULT_COLUMN_VISIBILITY: GridColumnVisibilityModel = {
    srNo: true,
    code: true,
    name: true,
    contact: true,
    address: true,
    isActive: true,
};

function normalizeBranchesColumnsModel(model: unknown): GridColumnVisibilityModel | null {
    if (!model || typeof model !== 'object') return null;
    return model as GridColumnVisibilityModel;
}

export default function BranchTable({ initialBranches, initialBranchRowCount = 0 }: BranchTableProps) {
    const [query, setQuery] = useState('');
    const [editBranch, setEditBranch] = useState<Branch | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<Branch | null>(null);
    const [message, setMessage] = useState<Message | null>(null);
    const [loading, setLoading] = useState(false);
    const apiRef = useGridApiRef();

    const fetchBranchPage = useCallback(
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
            const res = await getBranchesPage({ includeInactive: true, search, page, pageSize, sortModel, filterModel });
            return { rows: res.rows, total: res.total };
        },
        []
    );

    const {
        rows: branches,
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
    } = useServerPaginatedGrid<Branch>({
        initialRows: initialBranches,
        initialRowCount: initialBranchRowCount,
        initialPaginationModel: { page: 0, pageSize: 10 },
        query,
        fetchPage: fetchBranchPage,
    });

    const gridRows = useMemo(() => {
        const baseIndex = paginationModel.page * paginationModel.pageSize;
        return (branches || []).map((b, idx) => ({ ...b, srNo: baseIndex + idx + 1 }));
    }, [branches, paginationModel.page, paginationModel.pageSize]);

    const [columnVisibility, setColumnVisibility] = useState<GridColumnVisibilityModel>(DEFAULT_COLUMN_VISIBILITY);
    const persistTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastQueuedVisibilityRef = useRef(JSON.stringify(DEFAULT_COLUMN_VISIBILITY));
    const lastSavedVisibilityRef = useRef(JSON.stringify(DEFAULT_COLUMN_VISIBILITY));

    const handleDelete = async () => {
        if (!deleteConfirm) return;
        const res = await deleteBranch(deleteConfirm._id);
        if (res.error) {
            setMessage({ type: 'error', text: res.error });
        } else {
            setMessage({ type: 'success', text: 'Branch deactivated successfully' });
            refreshRows();
        }
        setDeleteConfirm(null);
    };

    const handleUpdate = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!editBranch) return;
        setLoading(true);
        const formData = new FormData(e.currentTarget);
        const res = await updateBranch(editBranch._id, formData);
        if (res.error) {
            setMessage({ type: 'error', text: res.error });
        } else {
            setMessage({ type: 'success', text: 'Branch updated successfully' });
            setEditBranch(null);
            refreshRows();
        }
        setLoading(false);
    };

    useEffect(() => {
        (async () => {
            try {
                const saved = await getUiSetting('branchesTableSettings');
                const model = normalizeBranchesColumnsModel((saved as { columnVisibilityModel?: unknown })?.columnVisibilityModel);
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
                await setUiSetting('branchesTableSettings', { columnVisibilityModel: next }, 'general');
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
            field: 'code',
            headerName: 'Code',
            flex: 0.8,
            minWidth: 120,
            headerAlign: 'center',
            align: 'center',
            renderCell: (params) => (
                <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', justifyContent: 'center' }}>
                    <Chip label={params.row?.code || '-'} size="small" variant="outlined" />
                </Box>
            ),
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
            field: 'contact',
            headerName: 'Contact',
            flex: 1,
            minWidth: 150,
            sortable: false,
            renderCell: (params) => {
                const branch = params.row as Branch;
                return (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, py: 0.75 }}>
                        {branch?.contact && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Phone fontSize="small" color="action" />
                                <Typography variant="body2">{branch.contact}</Typography>
                            </Box>
                        )}
                        {branch?.email && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Email fontSize="small" color="action" />
                                <Typography variant="body2">{branch.email}</Typography>
                            </Box>
                        )}
                        {!branch?.contact && !branch?.email && <span>-</span>}
                    </Box>
                );
            },
        },
        {
            field: 'address',
            headerName: 'Address',
            flex: 1.5,
            minWidth: 180,
            sortable: false,
            renderCell: (params) => {
                const addr = params.row?.address;
                if (!addr) return <span>-</span>;
                return (
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, py: 0.75 }}>
                        <LocationOn fontSize="small" color="action" sx={{ mt: 0.3 }} />
                        <Typography
                            variant="body2"
                            sx={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}
                        >
                            {addr}
                        </Typography>
                    </Box>
                );
            },
        },
        {
            field: 'isActive',
            headerName: 'Status',
            width: 120,
            headerAlign: 'center',
            align: 'center',
            renderCell: (params) => (
                <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', justifyContent: 'center' }}>
                    <Chip
                        label={params.row?.isActive ? 'Active' : 'Inactive'}
                        size="small"
                        color={params.row?.isActive ? 'success' : 'default'}
                    />
                </Box>
            ),
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
                const branch = params.row as Branch;
                return (
                    <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', justifyContent: 'center', gap: 0.5 }}>
                        <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => setEditBranch(branch)}>
                                <Edit fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Deactivate">
                            <IconButton
                                size="small"
                                color="error"
                                onClick={() => setDeleteConfirm(branch)}
                                disabled={!branch?.isActive}
                            >
                                <Delete fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                );
            },
        },
    ];

    function GridToolbar() {
        const fileName = 'branches';
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
                        entity="branches"
                        filename={fileName}
                        disabled={gridLoading}
                        payload={{
                            includeInactive: true,
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
                    placeholder="Search by name, code, contact, email, address (min 2 chars)..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    sx={{ minWidth: { xs: '100%', sm: 360 } }}
                />
                {gridLoading && searchActive && <Chip size="small" label="Searching..." />}
            </Box>

            {showEmptyState && (
                <Typography color="text.secondary" sx={{ mb: 2 }}>
                    No branches found. Create your first branch above.
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
                    '& .MuiDataGrid-cell': { alignItems: 'center' },
                }}
            />

            {/* Edit Branch Dialog */}
            <Dialog open={!!editBranch} onClose={() => setEditBranch(null)} maxWidth="sm" fullWidth>
                <Box component="form" onSubmit={handleUpdate}>
                    <DialogTitle>Edit Branch</DialogTitle>
                    <DialogContent dividers>
                        <Grid container spacing={2} sx={{ mt: 0.5 }}>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                    name="name"
                                    label="Branch Name"
                                    fullWidth
                                    required
                                    defaultValue={editBranch?.name}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                    name="code"
                                    label="Branch Code"
                                    fullWidth
                                    defaultValue={editBranch?.code}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                    name="contact"
                                    label="Contact Number"
                                    fullWidth
                                    defaultValue={editBranch?.contact}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                    name="email"
                                    label="Email"
                                    type="email"
                                    fullWidth
                                    defaultValue={editBranch?.email}
                                />
                            </Grid>
                            <Grid size={{ xs: 12 }}>
                                <TextField
                                    name="address"
                                    label="Address"
                                    fullWidth
                                    multiline
                                    rows={2}
                                    defaultValue={editBranch?.address}
                                />
                            </Grid>
                        </Grid>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setEditBranch(null)} disabled={loading}>Cancel</Button>
                        <Button type="submit" variant="contained" disabled={loading}>
                            {loading ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </DialogActions>
                </Box>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
                <DialogTitle>Confirm Deactivation</DialogTitle>
                <DialogContent dividers>
                    Are you sure you want to deactivate <strong>{deleteConfirm?.name}</strong>?
                    This will hide the branch from selection dropdowns.
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                    <Button onClick={handleDelete} color="error" variant="contained">
                        Deactivate
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
