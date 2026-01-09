'use client';

import { enrollStudent } from '@/app/actions/enrollment';
import { useRef, useState } from 'react';
import { Box, Button, TextField, Alert, Grid, MenuItem } from '@mui/material';

export default function EnrollStudentForm({ years, students, defaultYearId }) {
    const formRef = useRef(null);
    const [message, setMessage] = useState('');
    const [severity, setSeverity] = useState('info');

    async function action(formData) {
        const res = await enrollStudent(formData);
        if (res.error) {
            setMessage(res.error);
            setSeverity('error');
        } else {
            setMessage('Student enrolled successfully!');
            setSeverity('success');
            formRef.current?.reset();
        }
    }

    return (
        <Box component="form" ref={formRef} action={action} sx={{ mt: 1 }}>
            <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                    <TextField
                        select
                        name="academicYearId"
                        label="Academic Year"
                        fullWidth
                        required
                        defaultValue={defaultYearId || ''}
                    >
                        <MenuItem value="">Select Year</MenuItem>
                        {years.map(y => (
                            <MenuItem key={y._id} value={y._id}>{y.name}</MenuItem>
                        ))}
                    </TextField>
                </Grid>
                <Grid item xs={12} md={6}>
                    <TextField
                        select
                        name="studentId"
                        label="Student"
                        fullWidth
                        required
                        defaultValue=""
                    >
                        <MenuItem value="">Select Student</MenuItem>
                        {students.map(s => (
                            <MenuItem key={s._id} value={s._id}>{s.firstName} {s.lastName} ({s.admissionNumber})</MenuItem>
                        ))}
                    </TextField>
                </Grid>
                <Grid item xs={12} sm={4}>
                    <TextField name="class" label="Class" placeholder="e.g. Grade 5" fullWidth required />
                </Grid>
                <Grid item xs={12} sm={4}>
                    <TextField name="section" label="Section" placeholder="A" fullWidth required />
                </Grid>
                <Grid item xs={12} sm={4}>
                    <TextField name="rollNumber" label="Roll No" fullWidth />
                </Grid>
                <Grid item xs={12}>
                    <Button type="submit" variant="contained" size="large">
                        Enroll
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
