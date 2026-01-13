'use client';

import { useState } from 'react';
import { deleteBranch, updateBranch } from '@/app/actions/branch';
import {
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
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
import { Edit, Delete, Phone, Email, LocationOn } from '@mui/icons-material';

export default function BranchTable({ branches }) {
    const [editBranch, setEditBranch] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [message, setMessage] = useState(null);
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

    const handleUpdate = async (e) => {
        e.preventDefault();
        setLoading(true);
        const formData = new FormData(e.target);
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

    return (
        <>
            {message && (
                <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
                    {message.text}
                </Alert>
            )}

            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow sx={{ bgcolor: 'grey.100' }}>
                            <TableCell>Code</TableCell>
                            <TableCell>Name</TableCell>
                            <TableCell>Contact</TableCell>
                            <TableCell>Address</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {branches.map((branch) => (
                            <TableRow key={branch._id} hover>
                                <TableCell>
                                    <Chip label={branch.code || '-'} size="small" variant="outlined" />
                                </TableCell>
                                <TableCell>
                                    <Typography variant="body2" fontWeight="medium">
                                        {branch.name}
                                    </Typography>
                                </TableCell>
                                <TableCell>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                        {branch.contact && (
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                <Phone fontSize="small" color="action" />
                                                <Typography variant="body2">{branch.contact}</Typography>
                                            </Box>
                                        )}
                                        {branch.email && (
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                <Email fontSize="small" color="action" />
                                                <Typography variant="body2">{branch.email}</Typography>
                                            </Box>
                                        )}
                                        {!branch.contact && !branch.email && '-'}
                                    </Box>
                                </TableCell>
                                <TableCell>
                                    {branch.address ? (
                                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                                            <LocationOn fontSize="small" color="action" sx={{ mt: 0.3 }} />
                                            <Typography variant="body2" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {branch.address}
                                            </Typography>
                                        </Box>
                                    ) : '-'}
                                </TableCell>
                                <TableCell>
                                    <Chip
                                        label={branch.isActive ? 'Active' : 'Inactive'}
                                        size="small"
                                        color={branch.isActive ? 'success' : 'default'}
                                    />
                                </TableCell>
                                <TableCell align="right">
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
                                            disabled={!branch.isActive}
                                        >
                                            <Delete fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

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
