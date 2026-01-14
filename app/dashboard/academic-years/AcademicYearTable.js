'use client';

import { useState } from 'react';
import { setActiveYear, deleteAcademicYear, updateAcademicYear, lockAcademicYear } from '@/app/actions/academicYear';
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
    Grid
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { Edit, Delete, CheckCircle, Lock, LockOpen } from '@mui/icons-material';

function formatDate(dateStr) {
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

export default function AcademicYearTable({ years }) {
    const [editYear, setEditYear] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [activateConfirm, setActivateConfirm] = useState(null);
    const [message, setMessage] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleSetActive = async () => {
        if (!activateConfirm) return;
        setLoading(true);
        const res = await setActiveYear(activateConfirm._id);
        if (res.error) {
            setMessage({ type: 'error', text: res.error });
        } else {
            setMessage({ type: 'success', text: `${activateConfirm.name} is now the active year` });
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
        }
        setDeleteConfirm(null);
        setLoading(false);
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        setLoading(true);
        const formData = new FormData(e.target);
        const res = await updateAcademicYear(editYear._id, formData);
        if (res.error) {
            setMessage({ type: 'error', text: res.error });
        } else {
            setMessage({ type: 'success', text: 'Academic year updated successfully' });
            setEditYear(null);
        }
        setLoading(false);
    };

    const handleToggleLock = async (year) => {
        setLoading(true);
        const res = await lockAcademicYear(year._id, !year.isLocked);
        if (res.error) {
            setMessage({ type: 'error', text: res.error });
        } else {
            setMessage({ type: 'success', text: `Academic year ${year.isLocked ? 'unlocked' : 'locked'}` });
        }
        setLoading(false);
    };

    if (years.length === 0) {
        return (
            <Typography color="text.secondary" sx={{ mt: 2 }}>
                No academic years found. Create your first one above.
            </Typography>
        );
    }

    return (
        <>
            {message && (
                <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
                    {message.text}
                </Alert>
            )}

            <Box sx={{ bgcolor: 'white', borderRadius: 2 }}>
                <DataGrid
                    rows={(years || []).map((y, idx) => ({ ...y, srNo: idx + 1 }))}
                    getRowId={(row) => row._id}
                    autoHeight
                    disableRowSelectionOnClick
                    pageSizeOptions={[10]}
                    initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
                    columns={[
                        {
                            field: 'srNo',
                            headerName: 'Sr No',
                            width: 80,
                            headerAlign: 'center',
                            align: 'center',
                        },
                        {
                            field: 'name',
                            headerName: 'Name',
                            flex: 1,
                            minWidth: 160,
                            renderCell: (params) => (
                                <Typography variant="body2" fontWeight="medium">
                                    {params.row?.name}
                                </Typography>
                            ),
                        },
                        {
                            field: 'startDate',
                            headerName: 'Start Date',
                            width: 140,
                            headerAlign: 'center',
                            align: 'center',
                            valueGetter: (_value, row) => formatDate(row?.startDate),
                        },
                        {
                            field: 'endDate',
                            headerName: 'End Date',
                            width: 140,
                            headerAlign: 'center',
                            align: 'center',
                            valueGetter: (_value, row) => formatDate(row?.endDate),
                        },
                        {
                            field: '__status',
                            headerName: 'Status',
                            width: 170,
                            sortable: false,
                            filterable: false,
                            renderCell: (params) => {
                                const year = params.row;
                                return (
                                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
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
                            width: 170,
                            headerAlign: 'center',
                            align: 'center',
                            sortable: false,
                            filterable: false,
                            renderCell: (params) => {
                                const year = params.row;
                                return (
                                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', justifyContent: 'center' }}>
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
                    ]}
                    sx={{
                        border: 0,
                        '& .MuiDataGrid-columnHeaders': { bgcolor: 'grey.100' },
                    }}
                />
            </Box>

            {/* Activate Confirmation Dialog */}
            <Dialog open={!!activateConfirm} onClose={() => setActivateConfirm(null)}>
                <DialogTitle>Set Active Year</DialogTitle>
                <DialogContent>
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
                <DialogContent>
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
