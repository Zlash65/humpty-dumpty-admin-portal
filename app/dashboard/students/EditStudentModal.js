'use client';

import { useState, useRef } from 'react';
import { updateStudent } from '@/app/actions/student';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Grid,
    MenuItem,
    Alert,
    Box,
    Typography,
    Divider
} from '@mui/material';

export default function EditStudentModal({ student, open, onClose }) {
    const formRef = useRef(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const formData = new FormData(formRef.current);
        const res = await updateStudent(student._id, formData);

        if (res.error) {
            setError(res.error);
            setLoading(false);
        } else {
            setLoading(false);
            onClose();
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>Edit Student: {student.firstName} {student.lastName}</DialogTitle>
            <Box component="form" ref={formRef} onSubmit={handleSubmit}>
                <DialogContent dividers>
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                    <Typography variant="subtitle2" color="primary" gutterBottom>
                        Personal Information
                    </Typography>
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                name="firstName"
                                label="First Name"
                                fullWidth
                                required
                                defaultValue={student.firstName}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                name="lastName"
                                label="Last Name"
                                fullWidth
                                required
                                defaultValue={student.lastName}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField
                                name="dob"
                                label="Date of Birth"
                                type="date"
                                fullWidth
                                required
                                defaultValue={student.dob?.split('T')[0]}
                                slotProps={{ inputLabel: { shrink: true } }}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField
                                select
                                name="gender"
                                label="Gender"
                                fullWidth
                                required
                                defaultValue={student.gender}
                            >
                                <MenuItem value="Male">Male</MenuItem>
                                <MenuItem value="Female">Female</MenuItem>
                                <MenuItem value="Other">Other</MenuItem>
                            </TextField>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField
                                name="birthPlace"
                                label="Place of Birth"
                                fullWidth
                                defaultValue={student.birthPlace || ''}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                name="religion"
                                label="Religion"
                                fullWidth
                                defaultValue={student.religion || ''}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                name="address"
                                label="Address"
                                fullWidth
                                defaultValue={student.address || ''}
                            />
                        </Grid>
                    </Grid>

                    <Divider sx={{ my: 3 }} />

                    <Typography variant="subtitle2" color="primary" gutterBottom>
                        Parent/Guardian Information
                    </Typography>
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                name="fatherName"
                                label="Father's Name"
                                fullWidth
                                defaultValue={student.fatherName || ''}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                name="motherName"
                                label="Mother's Name"
                                fullWidth
                                defaultValue={student.motherName || ''}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                name="parentContact1"
                                label="Primary Contact"
                                fullWidth
                                defaultValue={student.parentContact1 || ''}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                name="parentContact2"
                                label="Secondary Contact"
                                fullWidth
                                defaultValue={student.parentContact2 || ''}
                            />
                        </Grid>
                    </Grid>

                    <Divider sx={{ my: 3 }} />

                    <Typography variant="subtitle2" color="primary" gutterBottom>
                        Financial
                    </Typography>
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                name="feeScholarship"
                                label="Scholarship Amount"
                                type="number"
                                fullWidth
                                defaultValue={student.feeScholarship || 0}
                                slotProps={{ input: { min: 0 } }}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose} disabled={loading}>Cancel</Button>
                    <Button type="submit" variant="contained" disabled={loading}>
                        {loading ? 'Saving...' : 'Save Changes'}
                    </Button>
                </DialogActions>
            </Box>
        </Dialog>
    );
}
