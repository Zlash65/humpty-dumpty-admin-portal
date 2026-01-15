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
    Alert,
    IconButton,
    Tooltip,
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
import { createTransport, deleteTransport, getTransportsPage, updateTransport } from '@/app/actions/transport';
import { getUiSetting, setUiSetting } from '@/app/actions/uiSettings';
import StandardDataGrid from '@/components/StandardDataGrid';
import useServerPaginatedGrid from '@/components/ui/grid/useServerPaginatedGrid';
import ExportAllCsvButton from '@/components/ui/grid/ExportAllCsvButton';
import SearchableSelect, { type SearchableSelectOption } from '@/components/ui/SearchableSelect';

const VEHICLE_TYPES = ['Bus', 'Mini Bus', 'Van', 'Auto'] as const;

interface TransportEntry {
    _id: string;
    driverName?: string;
    driverContact?: string;
    route?: string;
    vehicleType?: string;
    vehicleNumber?: string;
    capacity?: number;
}

interface TransportRow extends TransportEntry {
    srNo: number;
}

interface Message {
    type: 'success' | 'error' | 'info' | 'warning';
    text: string;
}

interface ElectronTransportClientProps {
    initialTransports?: TransportEntry[];
    initialTransportRowCount?: number;
    branchId: string;
    branchName?: string;
}

const DEFAULT_COLUMN_VISIBILITY: GridColumnVisibilityModel = {
    srNo: true,
    driver_name: true,
    driver_route: true,
    driver_car: true,
    driver_car_number: true,
    driver_contact: true,
};

function normalizeTransportColumnsModel(model: unknown): GridColumnVisibilityModel | null {
    if (!model || typeof model !== 'object') return null;
    const map: Record<string, string> = {
        driverName: 'driver_name',
        route: 'driver_route',
        vehicleType: 'driver_car',
        vehicleNumber: 'driver_car_number',
        driverContact: 'driver_contact',
    };
    const out = { ...(model as Record<string, boolean>) };
    for (const [oldKey, newKey] of Object.entries(map)) {
        if (Object.prototype.hasOwnProperty.call(out, oldKey) && !Object.prototype.hasOwnProperty.call(out, newKey)) {
            out[newKey] = out[oldKey];
        }
    }
    return out;
}

export default function ElectronTransportClient({
    initialTransports = [],
    initialTransportRowCount = 0,
    branchId,
    branchName = '',
}: ElectronTransportClientProps) {
    const [message, setMessage] = useState<Message | null>(null);
    const [query, setQuery] = useState('');
    const apiRef = useGridApiRef();

    const fetchTransportPage = useCallback(
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
            const res = await getTransportsPage({ page, pageSize, search, sortModel, filterModel });
            return {
                rows: Array.isArray(res?.rows) ? res.rows : [],
                total: Number(res?.total) || 0,
            };
        },
        []
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
    } = useServerPaginatedGrid<TransportEntry>({
        initialRows: initialTransports,
        initialRowCount: initialTransportRowCount,
        initialPaginationModel: { page: 0, pageSize: 10 },
        query,
        minChars: 2,
        debounceMs: 300,
        fetchPage: fetchTransportPage,
    });

    const [addOpen, setAddOpen] = useState(false);
    const [editRow, setEditRow] = useState<TransportRow | null>(null);
    const [deleteRow, setDeleteRow] = useState<TransportRow | null>(null);

    const [columnVisibility, setColumnVisibility] = useState<GridColumnVisibilityModel>(DEFAULT_COLUMN_VISIBILITY);
    const persistTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastQueuedVisibilityRef = useRef(JSON.stringify(DEFAULT_COLUMN_VISIBILITY));
    const lastSavedVisibilityRef = useRef(JSON.stringify(DEFAULT_COLUMN_VISIBILITY));

    useEffect(() => {
        (async () => {
            try {
                const saved = await getUiSetting('transportTableSettings');
                const model = normalizeTransportColumnsModel((saved as { columnVisibilityModel?: unknown })?.columnVisibilityModel);
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

    const gridRows: TransportRow[] = useMemo(() => {
        const baseIndex = paginationModel.page * paginationModel.pageSize;
        return (rows || []).map((t, idx) => ({ ...t, srNo: baseIndex + idx + 1 }));
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

    const queuePersistColumns = (next: GridColumnVisibilityModel) => {
        setColumnVisibility(next);
        const json = JSON.stringify(next);
        lastQueuedVisibilityRef.current = json;
        if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        persistTimerRef.current = setTimeout(async () => {
            if (lastSavedVisibilityRef.current === json) return;
            if (lastQueuedVisibilityRef.current !== json) return;
            try {
                await setUiSetting('transportTableSettings', { columnVisibilityModel: next }, 'general');
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
            { field: 'driver_name', headerName: 'Driver Name', flex: 1, minWidth: 150, valueGetter: (_value, row) => row?.driverName || '' },
            { field: 'driver_route', headerName: 'Route', flex: 1, minWidth: 120, valueGetter: (_value, row) => row?.route || '' },
            { field: 'driver_car', headerName: 'Vehicle', flex: 1, minWidth: 120, valueGetter: (_value, row) => row?.vehicleType || '' },
            { field: 'driver_car_number', headerName: 'Vehicle Number', flex: 1, minWidth: 130, valueGetter: (_value, row) => row?.vehicleNumber || '' },
            { field: 'driver_contact', headerName: 'Contact', flex: 1, minWidth: 120, valueGetter: (_value, row) => row?.driverContact || '' },
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
                                onClick={() => setEditRow(params.row as TransportRow)}
                            >
                                <EditIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                            <IconButton
                                size="small"
                                color="error"
                                onClick={() => setDeleteRow(params.row as TransportRow)}
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
        const fileName = `transport-${branchName || 'branch'}`.trim().replace(/\s+/g, '-');
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
                        entity="transport"
                        filename={fileName}
                        disabled={loading}
                        payload={{
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
                    <Typography variant="h4" fontWeight="bold">Transport</Typography>
                    <Typography
                        variant="body2"
                        color="text.secondary"
                        noWrap
                        sx={{ minWidth: 0, maxWidth: '100%' }}
                    >
                        Vehicles directory{branchName ? ` \u2022 ${branchName}` : ''}
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
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => setAddOpen(true)}
                        sx={{
                            height: 40,
                            width: { xs: '100%', sm: 'auto' },
                            flexShrink: 0,
                            minWidth: { sm: 'max-content' },
                            whiteSpace: 'nowrap',
                            px: 3,
                        }}
                    >
                        Add Vehicle
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
                    id="transport-search"
                    value={query}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                    placeholder="Search driver, route, vehicle no (min 2 chars)..."
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
                pageSizeOptions={[10, 25, 50]}
                initialState={{ sorting: { sortModel: [{ field: 'srNo', sort: 'asc' }] } }}
                columnVisibilityModel={columnVisibility}
                onColumnVisibilityModelChange={queuePersistColumns}
                slots={{ toolbar: GridToolbar }}
            />

            <TransportDialog
                mode="add"
                open={addOpen}
                onClose={() => setAddOpen(false)}
                branchId={branchId}
                onDone={(res) => {
                    if (res?.error) setMessage({ type: 'error', text: res.error });
                    else setMessage({ type: 'success', text: 'Vehicle added.' });
                    setAddOpen(false);
                    refreshRows();
                }}
            />

            <TransportDialog
                mode="edit"
                open={!!editRow}
                onClose={() => setEditRow(null)}
                branchId={branchId}
                initial={editRow}
                onDone={(res) => {
                    if (res?.error) setMessage({ type: 'error', text: res.error });
                    else setMessage({ type: 'success', text: 'Vehicle updated.' });
                    setEditRow(null);
                    refreshRows();
                }}
            />

            <Dialog open={!!deleteRow} onClose={() => setDeleteRow(null)}>
                <DialogTitle>Delete Vehicle</DialogTitle>
                <DialogContent dividers>
                    <Typography>
                        Delete <strong>{deleteRow?.vehicleNumber}</strong>?
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteRow(null)}>Cancel</Button>
                    <Button
                        color="error"
                        variant="contained"
                        onClick={async () => {
                            const res = await deleteTransport(deleteRow!._id);
                            if (res?.error) setMessage({ type: 'error', text: res.error });
                            else setMessage({ type: 'success', text: 'Vehicle deleted.' });
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

interface TransportDialogProps {
    mode: 'add' | 'edit';
    open: boolean;
    onClose: () => void;
    branchId: string;
    initial?: TransportRow | null;
    onDone?: (res: { error?: string; success?: boolean }) => void;
}

function TransportDialog({ mode, open, onClose, branchId, initial, onDone }: TransportDialogProps) {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [vehicleType, setVehicleType] = useState(initial?.vehicleType || VEHICLE_TYPES[0]);

    const vehicleTypeOptions = useMemo<SearchableSelectOption[]>(
        () => VEHICLE_TYPES.map((t) => ({ value: t, label: t, keywords: t })),
        []
    );

    useEffect(() => {
        if (!open) return;
        setError('');
        setSubmitting(false);
        setVehicleType(initial?.vehicleType || VEHICLE_TYPES[0]);
    }, [open, initial?._id, initial?.vehicleType]);

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');

        const formData = new FormData(e.currentTarget);
        // Keep branch linkage for multi-branch setups, even though Electron's SQLite didn't have it.
        if (branchId) formData.set('branchId', branchId);
        formData.set('vehicleType', vehicleType);

        try {
            const res =
                mode === 'edit'
                    ? await updateTransport(initial!._id, formData)
                    : await createTransport(formData);
            if (res?.error) {
                setError(res.error);
                onDone?.(res);
                return;
            }
            onDone?.({ success: true });
        } catch (err) {
            const msg = (err as Error)?.message || 'Failed to save vehicle';
            setError(msg);
            onDone?.({ error: msg });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>{mode === 'edit' ? 'Edit Vehicle' : 'Add Vehicle'}</DialogTitle>
            <Box component="form" onSubmit={handleSubmit}>
                <DialogContent dividers>
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField name="driverName" label="Driver Name" fullWidth required defaultValue={initial?.driverName || ''} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField name="driverContact" label="Driver Contact" fullWidth required defaultValue={initial?.driverContact || ''} />
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                            <TextField name="route" label="Route" fullWidth required defaultValue={initial?.route || ''} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <SearchableSelect
                                name="vehicleType"
                                label="Vehicle Type"
                                placeholder="Select"
                                size="medium"
                                value={vehicleType}
                                onChange={setVehicleType}
                                options={vehicleTypeOptions}
                                required
                                disableClearable
                                listboxMaxHeight={240}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField name="vehicleNumber" label="Vehicle Number" fullWidth required defaultValue={initial?.vehicleNumber || ''} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField name="capacity" label="Capacity (seats)" type="number" fullWidth defaultValue={initial?.capacity || ''} />
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
