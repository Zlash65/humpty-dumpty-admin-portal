'use client';

import { createAcademicYear } from '@/app/actions/academicYear';
import { useRef, useState } from 'react';
import { Box, Button, TextField, Alert, Grid } from '@mui/material';
import { AlertColor } from '@mui/material/Alert';

export default function CreateYearForm() {
    const formRef = useRef<HTMLFormElement>(null);
    const [message, setMessage] = useState('');
    const [severity, setSeverity] = useState<AlertColor>('info');

    async function action(formData: FormData) {
        const res = await createAcademicYear(formData);
        if (res.error) {
            setMessage(res.error);
            setSeverity('error');
        } else {
            setMessage('Academic Year created successfully!');
            setSeverity('success');
            formRef.current?.reset();
        }
    }

    return (
        <Box component="form" ref={formRef} action={action} sx={{ mt: 1 }}>
            <Grid container spacing={2} alignItems="center">
                <Grid size={{ xs: 12, md: 3 }}>
                    <TextField
                        name="name"
                        label="Name (e.g. 2024-2025)"
                        fullWidth
                        required
                        InputLabelProps={{ shrink: true }}
                    />
                </Grid>
                <Grid size={{ xs: 12, md: 3 }}>
                    <TextField
                        name="startDate"
                        label="Start Date"
                        type="date"
                        fullWidth
                        required
                        InputLabelProps={{ shrink: true }}
                    />
                </Grid>
                <Grid size={{ xs: 12, md: 3 }}>
                    <TextField
                        name="endDate"
                        label="End Date"
                        type="date"
                        fullWidth
                        required
                        InputLabelProps={{ shrink: true }}
                    />
                </Grid>
                <Grid size={{ xs: 12, md: 3 }}>
                    <Button type="submit" variant="contained" fullWidth size="large">
                        Create
                    </Button>
                </Grid>
            </Grid>

            {message && (
                <Alert severity={severity} sx={{ mt: 2 }}>
                    {message}
                </Alert>
            )}
        </Box>
    );
}
