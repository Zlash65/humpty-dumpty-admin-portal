'use client';

import { useEffect, useMemo, useRef, useState, FormEvent, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
    Box,
    Typography,
    Paper,
    Button,
    TextField,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Grid,
    MenuItem,
    Alert,
    IconButton,
    Tooltip,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import {
    DataGrid,
    GridToolbarContainer,
    GridToolbarColumnsButton,
    GridToolbarFilterButton,
    GridToolbarDensitySelector,
    GridToolbarExport,
    GridColDef,
    GridRenderCellParams,
    GridColumnVisibilityModel,
} from '@mui/x-data-grid';
import { createTransport, deleteTransport, updateTransport } from '@/app/actions/transport';
import { getUiSetting, setUiSetting } from '@/app/actions/uiSettings';

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
    transports?: TransportEntry[];
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
    transports = [],
    branchId,
    branchName = '',
}: ElectronTransportClientProps) {
    const router = useRouter();
    const [message, setMessage] = useState<Message | null>(null);
    const [query, setQuery] = useState('');

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

    const rows: TransportRow[] = useMemo(() => {
        const q = String(query || '').trim().toLowerCase();
        const base = (transports || []).map((t, idx) => ({ ...t, srNo: idx + 1 }));
        if (!q) return base;
        return base.filter((t) => (
            String(t.driverName || '').toLowerCase().includes(q) ||
            String(t.driverContact || '').toLowerCase().includes(q) ||
            String(t.route || '').toLowerCase().includes(q) ||
            String(t.vehicleNumber || '').toLowerCase().includes(q)
        ));
    }, [transports, query]);

    const columns: GridColDef[] = useMemo(() => {
        return [
            {
                field: 'srNo',
                headerName: 'Sr No',
                width: 90,
                sortable: false,
                filterable: false,
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
                width: 180,
                sortable: false,
                filterable: false,
                hideable: false,
                headerAlign: 'center',
                align: 'center',
                renderCell: (params: GridRenderCellParams) => (
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', height: '100%', justifyContent: 'center' }}>
                        <Button
                            variant="contained"
                            color="primary"
                            size="small"
                            onClick={() => setEditRow(params.row as TransportRow)}
                            sx={{ mr: 1 }}
                        >
                            Edit
                        </Button>
                        <Button
                            variant="contained"
                            color="error"
                            size="small"
                            onClick={() => setDeleteRow(params.row as TransportRow)}
                        >
                            Delete
                        </Button>
                    </Box>
                ),
            },
        ];
    }, []);

    function GridToolbar() {
        const fileName = `transport-${branchName || 'branch'}`.trim().replace(/\s+/g, '-');
        return (
            <GridToolbarContainer sx={{ justifyContent: 'space-between', p: 1 }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <GridToolbarColumnsButton />
                    <GridToolbarFilterButton />
                    <GridToolbarDensitySelector />
                </Box>
                <GridToolbarExport
                    csvOptions={{ fileName, utf8WithBom: true }}
                    printOptions={{ disableToolbarButton: true }}
                    slotProps={{ button: { size: 'small' } }}
                />
            </GridToolbarContainer>
        );
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 2 }}>
                <Box>
                    <Typography variant="h4" fontWeight="bold">Transport</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Vehicles directory{branchName ? ` \u2022 ${branchName}` : ''}
                    </Typography>
                </Box>
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
                    Add Vehicle
                </Button>
            </Box>

            {message && (
                <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
                    {message.text}
                </Alert>
            )}

            <Paper sx={{ p: 2, mb: 2 }}>
                <TextField
                    value={query}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                    placeholder="Search driver, route, vehicle no..."
                    label="Search"
                    fullWidth
                />
            </Paper>

            <Paper sx={{ p: 1 }}>
                <DataGrid
                    rows={rows}
                    columns={columns}
                    getRowId={(row) => row._id}
                    autoHeight
                    disableRowSelectionOnClick
                    pageSizeOptions={[10]}
                    initialState={{
                        pagination: { paginationModel: { pageSize: 10, page: 0 } },
                        sorting: { sortModel: [{ field: 'srNo', sort: 'asc' }] },
                    }}
                    columnVisibilityModel={columnVisibility}
                    onColumnVisibilityModelChange={queuePersistColumns}
                    slots={{ toolbar: GridToolbar }}
                />
            </Paper>

            <TransportDialog
                mode="add"
                open={addOpen}
                onClose={() => setAddOpen(false)}
                branchId={branchId}
                onDone={(res) => {
                    if (res?.error) setMessage({ type: 'error', text: res.error });
                    else setMessage({ type: 'success', text: 'Vehicle added.' });
                    setAddOpen(false);
                    router.refresh();
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
                    router.refresh();
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
                            router.refresh();
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

    useEffect(() => {
        if (!open) return;
        setError('');
        setSubmitting(false);
    }, [open, initial?._id]);

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');

        const formData = new FormData(e.currentTarget);
        // Keep branch linkage for multi-branch setups, even though Electron's SQLite didn't have it.
        if (branchId) formData.set('branchId', branchId);

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
                            <TextField select name="vehicleType" label="Vehicle Type" fullWidth required defaultValue={initial?.vehicleType || VEHICLE_TYPES[0]}>
                                {VEHICLE_TYPES.map((t) => (
                                    <MenuItem key={t} value={t}>{t}</MenuItem>
                                ))}
                            </TextField>
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
