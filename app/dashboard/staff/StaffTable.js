'use client';

import { useState } from 'react';
import { deleteStaff, updateStaff } from '@/app/actions/staff';
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
    Box,
    TextField,
    Grid,
    MenuItem
} from '@mui/material';
import { Edit, Delete, Phone, Email, School, Person } from '@mui/icons-material';

export default function StaffTable({ staff, branches = [] }) {
    const [editStaff, setEditStaff] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [message, setMessage] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleDelete = async () => {
        if (!deleteConfirm) return;
        const res = await deleteStaff(deleteConfirm._id);
        if (res.error) {
            setMessage({ type: 'error', text: res.error });
        } else {
            setMessage({ type: 'success', text: 'Staff member removed successfully' });
        }
        setDeleteConfirm(null);
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        setLoading(true);
        const formData = new FormData(e.target);
        const res = await updateStaff(editStaff._id, formData);
        if (res.error) {
            setMessage({ type: 'error', text: res.error });
        } else {
            setMessage({ type: 'success', text: 'Staff updated successfully' });
            setEditStaff(null);
        }
        setLoading(false);
    };

    if (staff.length === 0) {
        return (
            <Typography color="text.secondary" sx={{ mt: 2 }}>
                No staff found.
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
                            <TableCell>Name</TableCell>
                            <TableCell>Type</TableCell>
                            <TableCell>Role</TableCell>
                            <TableCell>Contact</TableCell>
                            <TableCell>Branch</TableCell>
                            <TableCell>Assignments</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {staff.map((member) => (
                            <TableRow key={member._id} hover>
                                <TableCell>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        {member.staffType === 'teacher' ? (
                                            <School color="primary" fontSize="small" />
                                        ) : (
                                            <Person color="action" fontSize="small" />
                                        )}
                                        <Typography variant="body2" fontWeight="medium">
                                            {member.name}
                                        </Typography>
                                    </Box>
                                </TableCell>
                                <TableCell>
                                    <Chip
                                        label={member.staffType === 'teacher' ? 'Teacher' : 'Office'}
                                        size="small"
                                        color={member.staffType === 'teacher' ? 'primary' : 'default'}
                                        variant="outlined"
                                    />
                                </TableCell>
                                <TableCell>{member.role || '-'}</TableCell>
                                <TableCell>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                        {member.contact && (
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                <Phone fontSize="small" color="action" />
                                                <Typography variant="body2">{member.contact}</Typography>
                                            </Box>
                                        )}
                                        {member.email && (
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                <Email fontSize="small" color="action" />
                                                <Typography variant="body2">{member.email}</Typography>
                                            </Box>
                                        )}
                                        {!member.contact && !member.email && '-'}
                                    </Box>
                                </TableCell>
                                <TableCell>
                                    {member.branchName ? (
                                        <Chip label={member.branchName} size="small" variant="outlined" />
                                    ) : '-'}
                                </TableCell>
                                <TableCell>
                                    {member.assignments?.length > 0 ? (
                                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                            {member.assignments.map((a, i) => (
                                                <Chip
                                                    key={i}
                                                    label={`${a.className}${a.division ? ` (${a.division})` : ''}`}
                                                    size="small"
                                                    color="secondary"
                                                    variant="outlined"
                                                />
                                            ))}
                                        </Box>
                                    ) : '-'}
                                </TableCell>
                                <TableCell align="right">
                                    <Tooltip title="Edit">
                                        <IconButton size="small" onClick={() => setEditStaff(member)}>
                                            <Edit fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Remove">
                                        <IconButton size="small" color="error" onClick={() => setDeleteConfirm(member)}>
                                            <Delete fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Edit Staff Dialog */}
            <Dialog open={!!editStaff} onClose={() => setEditStaff(null)} maxWidth="sm" fullWidth>
                <Box component="form" onSubmit={handleUpdate}>
                    <DialogTitle>Edit Staff: {editStaff?.name}</DialogTitle>
                    <DialogContent dividers>
                        <Grid container spacing={2} sx={{ mt: 0.5 }}>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                    name="name"
                                    label="Full Name"
                                    fullWidth
                                    required
                                    defaultValue={editStaff?.name}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                    select
                                    name="staffType"
                                    label="Staff Type"
                                    fullWidth
                                    required
                                    defaultValue={editStaff?.staffType}
                                >
                                    <MenuItem value="office">Office Staff</MenuItem>
                                    <MenuItem value="teacher">Teacher</MenuItem>
                                </TextField>
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                    name="role"
                                    label="Role/Position"
                                    fullWidth
                                    defaultValue={editStaff?.role}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                    name="contact"
                                    label="Contact Number"
                                    fullWidth
                                    defaultValue={editStaff?.contact}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                    name="email"
                                    label="Email"
                                    type="email"
                                    fullWidth
                                    defaultValue={editStaff?.email}
                                />
                            </Grid>
                            {branches.length > 0 && (
                                <Grid size={{ xs: 12, sm: 6 }}>
                                    <TextField
                                        select
                                        name="branchId"
                                        label="Branch"
                                        fullWidth
                                        defaultValue={editStaff?.branchId || ''}
                                    >
                                        <MenuItem value="">Select Branch</MenuItem>
                                        {branches.map((branch) => (
                                            <MenuItem key={branch._id} value={branch._id}>
                                                {branch.name}
                                            </MenuItem>
                                        ))}
                                    </TextField>
                                </Grid>
                            )}
                        </Grid>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setEditStaff(null)} disabled={loading}>Cancel</Button>
                        <Button type="submit" variant="contained" disabled={loading}>
                            {loading ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </DialogActions>
                </Box>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
                <DialogTitle>Confirm Removal</DialogTitle>
                <DialogContent>
                    Are you sure you want to remove <strong>{deleteConfirm?.name}</strong> from staff?
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                    <Button onClick={handleDelete} color="error" variant="contained">
                        Remove
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
