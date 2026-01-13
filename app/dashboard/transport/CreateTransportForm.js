'use client';

import { createTransport } from '@/app/actions/transport';
import { useRef, useState } from 'react';
import { Box, Button, TextField, Alert, Grid, MenuItem } from '@mui/material';

const VEHICLE_TYPES = ['Bus', 'Mini Bus', 'Van', 'Auto'];

export default function CreateTransportForm({ branches = [] }) {
    const formRef = useRef(null);
    const [message, setMessage] = useState('');
    const [severity, setSeverity] = useState('info');

    async function action(formData) {
        const res = await createTransport(formData);
        if (res.error) {
            setMessage(res.error);
            setSeverity('error');
        } else {
            setMessage('Vehicle added successfully!');
            setSeverity('success');
            formRef.current?.reset();
        }
    }

    return (
        <Box component="form" ref={formRef} action={action} sx={{ mt: 1 }}>
            <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField name="driverName" label="Driver Name" fullWidth required />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField name="driverContact" label="Driver Contact" fullWidth required />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField name="route" label="Route" fullWidth required placeholder="e.g., Andheri - Borivali" />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                        select
                        name="vehicleType"
                        label="Vehicle Type"
                        fullWidth
                        required
                        defaultValue=""
                    >
                        <MenuItem value="">Select Type</MenuItem>
                        {VEHICLE_TYPES.map(type => (
                            <MenuItem key={type} value={type}>{type}</MenuItem>
                        ))}
                    </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                        name="vehicleNumber"
                        label="Vehicle Number"
                        fullWidth
                        required
                        placeholder="e.g., MH01AB1234"
                        slotProps={{ input: { style: { textTransform: 'uppercase' } } }}
                    />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                        name="capacity"
                        label="Capacity (seats)"
                        type="number"
                        fullWidth
                        slotProps={{ input: { min: 1 } }}
                    />
                </Grid>
                {branches.length > 0 && (
                    <Grid size={{ xs: 12, sm: 4 }}>
                        <TextField
                            select
                            name="branchId"
                            label="Branch"
                            fullWidth
                            defaultValue=""
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
                <Grid size={{ xs: 12 }}>
                    <Button type="submit" variant="contained" size="large">
                        Add Vehicle
                    </Button>
                </Grid>
            </Grid>

            {message && (
                <Alert severity={severity} sx={{ mt: 2 }} onClose={() => setMessage('')}>
                    {message}
                </Alert>
            )}
        </Box>
    );
}
