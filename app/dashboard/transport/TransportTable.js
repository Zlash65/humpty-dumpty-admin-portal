'use client';

import { useState } from 'react';
import { deleteTransport, updateTransport } from '@/app/actions/transport';
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
import { Edit, Delete, Phone, DirectionsBus, Route, People } from '@mui/icons-material';

const VEHICLE_TYPES = ['Bus', 'Mini Bus', 'Van', 'Auto'];

export default function TransportTable({ transports, branches = [] }) {
    const [editTransport, setEditTransport] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [message, setMessage] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleDelete = async () => {
        if (!deleteConfirm) return;
        const res = await deleteTransport(deleteConfirm._id);
        if (res.error) {
            setMessage({ type: 'error', text: res.error });
        } else {
            setMessage({ type: 'success', text: 'Vehicle removed successfully' });
        }
        setDeleteConfirm(null);
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        setLoading(true);
        const formData = new FormData(e.target);
        const res = await updateTransport(editTransport._id, formData);
        if (res.error) {
            setMessage({ type: 'error', text: res.error });
        } else {
            setMessage({ type: 'success', text: 'Vehicle updated successfully' });
            setEditTransport(null);
        }
        setLoading(false);
    };

    if (transports.length === 0) {
        return (
            <Typography color="text.secondary" sx={{ mt: 2 }}>
                No vehicles found.
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
                            <TableCell>Vehicle</TableCell>
                            <TableCell>Driver</TableCell>
                            <TableCell>Route</TableCell>
                            <TableCell>Capacity</TableCell>
                            <TableCell>Branch</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {transports.map((transport) => (
                            <TableRow key={transport._id} hover>
                                <TableCell>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <DirectionsBus color="primary" />
                                        <Box>
                                            <Chip
                                                label={transport.vehicleNumber}
                                                size="small"
                                                color="primary"
                                                variant="outlined"
                                            />
                                            <Typography variant="caption" display="block" color="text.secondary">
                                                {transport.vehicleType}
                                            </Typography>
                                        </Box>
                                    </Box>
                                </TableCell>
                                <TableCell>
                                    <Typography variant="body2" fontWeight="medium">
                                        {transport.driverName}
                                    </Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                                        <Phone fontSize="small" color="action" />
                                        <Typography variant="body2" color="text.secondary">
                                            {transport.driverContact}
                                        </Typography>
                                    </Box>
                                </TableCell>
                                <TableCell>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <Route fontSize="small" color="action" />
                                        <Typography variant="body2">{transport.route}</Typography>
                                    </Box>
                                </TableCell>
                                <TableCell>
                                    {transport.capacity ? (
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            <People fontSize="small" color="action" />
                                            <Typography variant="body2">{transport.capacity} seats</Typography>
                                        </Box>
                                    ) : '-'}
                                </TableCell>
                                <TableCell>
                                    {transport.branchName ? (
                                        <Chip label={transport.branchName} size="small" variant="outlined" />
                                    ) : '-'}
                                </TableCell>
                                <TableCell align="right">
                                    <Tooltip title="Edit">
                                        <IconButton size="small" onClick={() => setEditTransport(transport)}>
                                            <Edit fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Remove">
                                        <IconButton size="small" color="error" onClick={() => setDeleteConfirm(transport)}>
                                            <Delete fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Edit Transport Dialog */}
            <Dialog open={!!editTransport} onClose={() => setEditTransport(null)} maxWidth="sm" fullWidth>
                <Box component="form" onSubmit={handleUpdate}>
                    <DialogTitle>Edit Vehicle: {editTransport?.vehicleNumber}</DialogTitle>
                    <DialogContent dividers>
                        <Grid container spacing={2} sx={{ mt: 0.5 }}>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                    name="driverName"
                                    label="Driver Name"
                                    fullWidth
                                    required
                                    defaultValue={editTransport?.driverName}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                    name="driverContact"
                                    label="Driver Contact"
                                    fullWidth
                                    required
                                    defaultValue={editTransport?.driverContact}
                                />
                            </Grid>
                            <Grid size={{ xs: 12 }}>
                                <TextField
                                    name="route"
                                    label="Route"
                                    fullWidth
                                    required
                                    defaultValue={editTransport?.route}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                    select
                                    name="vehicleType"
                                    label="Vehicle Type"
                                    fullWidth
                                    required
                                    defaultValue={editTransport?.vehicleType}
                                >
                                    {VEHICLE_TYPES.map(type => (
                                        <MenuItem key={type} value={type}>{type}</MenuItem>
                                    ))}
                                </TextField>
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                    name="vehicleNumber"
                                    label="Vehicle Number"
                                    fullWidth
                                    required
                                    defaultValue={editTransport?.vehicleNumber}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                    name="capacity"
                                    label="Capacity (seats)"
                                    type="number"
                                    fullWidth
                                    defaultValue={editTransport?.capacity}
                                />
                            </Grid>
                            {branches.length > 0 && (
                                <Grid size={{ xs: 12, sm: 6 }}>
                                    <TextField
                                        select
                                        name="branchId"
                                        label="Branch"
                                        fullWidth
                                        defaultValue={editTransport?.branchId || ''}
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
                        <Button onClick={() => setEditTransport(null)} disabled={loading}>Cancel</Button>
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
                    Are you sure you want to remove vehicle <strong>{deleteConfirm?.vehicleNumber}</strong>?
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
