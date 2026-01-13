'use client';

import { createStudent } from '@/app/actions/student';
import { useRef, useState } from 'react';
import {
    Box,
    Button,
    TextField,
    Alert,
    Grid,
    MenuItem,
    Typography,
    Divider,
    Collapse,
    IconButton
} from '@mui/material';
import { ExpandMore, ExpandLess } from '@mui/icons-material';

export default function CreateStudentForm({ branches = [] }) {
    const formRef = useRef(null);
    const [message, setMessage] = useState('');
    const [severity, setSeverity] = useState('info');
    const [showOptional, setShowOptional] = useState(false);

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
            {/* Required Fields */}
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Basic Information *
            </Typography>
            <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField name="firstName" label="First Name" fullWidth required />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField name="lastName" label="Last Name" fullWidth required />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField name="admissionNumber" label="Admission No" fullWidth required />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                        name="dob"
                        label="Date of Birth"
                        type="date"
                        fullWidth
                        required
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
                        defaultValue=""
                    >
                        <MenuItem value="Male">Male</MenuItem>
                        <MenuItem value="Female">Female</MenuItem>
                        <MenuItem value="Other">Other</MenuItem>
                    </TextField>
                </Grid>
            </Grid>

            {/* Optional Fields Toggle */}
            <Box sx={{ mt: 3, mb: 1, display: 'flex', alignItems: 'center' }}>
                <Typography variant="subtitle2" color="text.secondary">
                    Additional Information (Optional)
                </Typography>
                <IconButton size="small" onClick={() => setShowOptional(!showOptional)}>
                    {showOptional ? <ExpandLess /> : <ExpandMore />}
                </IconButton>
            </Box>

            <Collapse in={showOptional}>
                <Divider sx={{ mb: 2 }} />

                {/* Parent Information */}
                <Typography variant="subtitle2" color="primary" gutterBottom sx={{ mt: 2 }}>
                    Parent/Guardian Details
                </Typography>
                <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField name="fatherName" label="Father's Name" fullWidth />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField name="motherName" label="Mother's Name" fullWidth />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                            name="parentContact1"
                            label="Primary Contact"
                            fullWidth
                            placeholder="Father/Guardian phone"
                        />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                            name="parentContact2"
                            label="Secondary Contact"
                            fullWidth
                            placeholder="Mother/Guardian phone"
                        />
                    </Grid>
                </Grid>

                {/* Additional Details */}
                <Typography variant="subtitle2" color="primary" gutterBottom sx={{ mt: 3 }}>
                    Other Details
                </Typography>
                <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField name="birthPlace" label="Place of Birth" fullWidth />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField name="religion" label="Religion" fullWidth />
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                        <TextField name="address" label="Address" fullWidth multiline rows={2} />
                    </Grid>
                </Grid>

                {/* Financial */}
                <Typography variant="subtitle2" color="primary" gutterBottom sx={{ mt: 3 }}>
                    Financial
                </Typography>
                <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                            name="feeScholarship"
                            label="Scholarship Amount"
                            type="number"
                            fullWidth
                            defaultValue="0"
                            slotProps={{ input: { min: 0 } }}
                        />
                    </Grid>
                    {branches.length > 0 && (
                        <Grid size={{ xs: 12, sm: 6 }}>
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
                </Grid>
            </Collapse>

            <Box sx={{ mt: 3 }}>
                <Button type="submit" variant="contained" size="large">
                    Admit Student
                </Button>
            </Box>

            {message && (
                <Alert severity={severity} sx={{ mt: 2 }} onClose={() => setMessage('')}>
                    {message}
                </Alert>
            )}
        </Box>
    );
}
