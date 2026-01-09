'use client';

import { createStudent } from '@/app/actions/student';
import { useRef, useState } from 'react';
import { Box, Button, TextField, Alert, Grid, MenuItem } from '@mui/material';

export default function CreateStudentForm() {
    const formRef = useRef(null);
    const [message, setMessage] = useState('');
    const [severity, setSeverity] = useState('info');

    async function action(formData) {
        const res = await createStudent(formData);
        if (res.error) {
            setMessage(res.error);
            setSeverity('error');
        } else {
            setMessage('Student admitted successfully!');
            setSeverity('success');
            formRef.current?.reset();
        }
    }

    return (
        <Box component="form" ref={formRef} action={action} sx={{ mt: 1 }}>
            <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                    <TextField name="firstName" label="First Name" fullWidth required />
                </Grid>
                <Grid item xs={12} sm={6}>
                    <TextField name="lastName" label="Last Name" fullWidth required />
                </Grid>
                <Grid item xs={12} sm={4}>
                    <TextField name="admissionNumber" label="Admission No" fullWidth required />
                </Grid>
                <Grid item xs={12} sm={4}>
                    <TextField name="dob" label="Date of Birth" type="date" fullWidth required InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid item xs={12} sm={4}>
                    <TextField
                        select
                        name="gender"
                        label="Gender"
                        fullWidth
                        required
                        defaultValue=""
                    >
                        <MenuItem value="Male">Male</MenuItem>
                        <MenuItem value="Female">Female</MenuItem>
                        <MenuItem value="Other">Other</MenuItem>
                    </TextField>
                </Grid>
                <Grid item xs={12}>
                    <Button type="submit" variant="contained" size="large">
                        Admit Student
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
