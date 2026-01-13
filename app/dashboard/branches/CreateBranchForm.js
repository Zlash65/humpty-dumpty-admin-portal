'use client';

import { createBranch } from '@/app/actions/branch';
import { useRef, useState } from 'react';
import { Box, Button, TextField, Alert, Grid } from '@mui/material';

export default function CreateBranchForm() {
    const formRef = useRef(null);
    const [message, setMessage] = useState('');
    const [severity, setSeverity] = useState('info');

    async function action(formData) {
        const res = await createBranch(formData);
        if (res.error) {
            setMessage(res.error);
            setSeverity('error');
        } else {
            setMessage('Branch created successfully!');
            setSeverity('success');
            formRef.current?.reset();
        }
    }

    return (
        <Box component="form" ref={formRef} action={action} sx={{ mt: 1 }}>
            <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField name="name" label="Branch Name" fullWidth required />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                        name="code"
                        label="Branch Code"
                        fullWidth
                        placeholder="Auto-generated if empty"
                        helperText="Short code like HDK, HDCT"
                    />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField name="contact" label="Contact Number" fullWidth />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField name="email" label="Email" type="email" fullWidth />
                </Grid>
                <Grid size={{ xs: 12 }}>
                    <TextField name="address" label="Address" fullWidth multiline rows={2} />
                </Grid>
                <Grid size={{ xs: 12 }}>
                    <Button type="submit" variant="contained" size="large">
                        Create Branch
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
