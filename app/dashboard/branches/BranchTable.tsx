'use client';

import { useState, FormEvent } from 'react';
import { deleteBranch, updateBranch } from '@/app/actions/branch';
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
    Box
} from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { Edit, Delete, Phone, Email, LocationOn } from '@mui/icons-material';

interface Branch {
    _id: string;
    name: string;
    code?: string;
    contact?: string;
    email?: string;
    address?: string;
    isActive?: boolean;
}

interface BranchTableProps {
    branches: Branch[];
}

interface Message {
    type: 'success' | 'error' | 'info' | 'warning';
    text: string;
}

export default function BranchTable({ branches }: BranchTableProps) {
    const [editBranch, setEditBranch] = useState<Branch | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<Branch | null>(null);
    const [message, setMessage] = useState<Message | null>(null);
    const [loading, setLoading] = useState(false);

    const handleDelete = async () => {
        if (!deleteConfirm) return;
        const res = await deleteBranch(deleteConfirm._id);
        if (res.error) {
            setMessage({ type: 'error', text: res.error });
        } else {
            setMessage({ type: 'success', text: 'Branch deactivated successfully' });
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
        }
        setLoading(false);
    };

    if (branches.length === 0) {
        return (
            <Typography color="text.secondary" sx={{ mt: 2 }}>
                No branches found. Create your first branch above.
            </Typography>
        );
    }

    const columns: GridColDef[] = [
        {
            field: 'srNo',
            headerName: 'Sr No',
            width: 80,
            headerAlign: 'center',
            align: 'center',
        },
        {
            field: 'code',
            headerName: 'Code',
            width: 110,
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
            flex: 1,
            minWidth: 180,
            renderCell: (params) => (
                <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                    <Typography variant="body2" fontWeight="medium">
                        {params.row?.name}
                    </Typography>
                </Box>
            ),
        },
        {
            field: 'contact',
            headerName: 'Contact',
            flex: 1,
            minWidth: 180,
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
            flex: 1.2,
            minWidth: 200,
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
            width: 130,
            headerAlign: 'center',
            align: 'center',
            sortable: false,
            filterable: false,
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

    return (
        <>
            {message && (
                <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
                    {message.text}
                </Alert>
            )}

            <Box sx={{ bgcolor: 'white', borderRadius: 2 }}>
                <DataGrid
                    rows={(branches || []).map((b, idx) => ({ ...b, srNo: idx + 1 }))}
                    getRowId={(row) => row._id}
                    autoHeight
                    disableRowSelectionOnClick
                    pageSizeOptions={[10]}
                    initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
                    columns={columns}
                    sx={{
                        border: 0,
                        '& .MuiDataGrid-columnHeaders': { bgcolor: 'grey.100' },
                        '& .MuiDataGrid-cell': { alignItems: 'center' },
                    }}
                />
            </Box>

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
                <DialogContent>
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
