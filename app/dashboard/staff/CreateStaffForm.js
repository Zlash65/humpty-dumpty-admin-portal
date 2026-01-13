'use client';

import { createStaff } from '@/app/actions/staff';
import { useRef, useState } from 'react';
import {
    Box,
    Button,
    TextField,
    Alert,
    Grid,
    MenuItem,
    Typography,
    Chip,
    IconButton
} from '@mui/material';
import { Add, Delete } from '@mui/icons-material';

const STAFF_ROLES = {
    office: ['Principal', 'Vice Principal', 'Coordinator', 'Accountant', 'Receptionist', 'Clerk', 'Peon', 'Other'],
    teacher: ['Class Teacher', 'Subject Teacher', 'Assistant Teacher', 'Physical Education', 'Music Teacher', 'Art Teacher', 'Other']
};

export default function CreateStaffForm({ branches = [] }) {
    const formRef = useRef(null);
    const [message, setMessage] = useState('');
    const [severity, setSeverity] = useState('info');
    const [staffType, setStaffType] = useState('office');
    const [assignments, setAssignments] = useState([]);

    const addAssignment = () => {
        setAssignments([...assignments, { className: '', division: '', shiftName: '' }]);
    };

    const removeAssignment = (index) => {
        setAssignments(assignments.filter((_, i) => i !== index));
    };

    const updateAssignment = (index, field, value) => {
        const updated = [...assignments];
        updated[index][field] = value;
        setAssignments(updated);
    };

    async function action(formData) {
        // Add assignments as JSON for teachers
        if (staffType === 'teacher' && assignments.length > 0) {
            formData.set('assignments', JSON.stringify(assignments.filter(a => a.className)));
        }

        const res = await createStaff(formData);
        if (res.error) {
            setMessage(res.error);
            setSeverity('error');
        } else {
            setMessage('Staff member added successfully!');
            setSeverity('success');
            formRef.current?.reset();
            setStaffType('office');
            setAssignments([]);
        }
    }

    return (
        <Box component="form" ref={formRef} action={action} sx={{ mt: 1 }}>
            <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField name="name" label="Full Name" fullWidth required />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                        select
                        name="staffType"
                        label="Staff Type"
                        fullWidth
                        required
                        value={staffType}
                        onChange={(e) => setStaffType(e.target.value)}
                    >
                        <MenuItem value="office">Office Staff</MenuItem>
                        <MenuItem value="teacher">Teacher</MenuItem>
                    </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                        select
                        name="role"
                        label="Role/Position"
                        fullWidth
                        defaultValue=""
                    >
                        <MenuItem value="">Select Role</MenuItem>
                        {STAFF_ROLES[staffType].map(role => (
                            <MenuItem key={role} value={role}>{role}</MenuItem>
                        ))}
                    </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField name="contact" label="Contact Number" fullWidth />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField name="email" label="Email" type="email" fullWidth />
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

            {/* Teacher Assignments */}
            {staffType === 'teacher' && (
                <Box sx={{ mt: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                        <Typography variant="subtitle2" color="primary">
                            Class Assignments
                        </Typography>
                        <Button size="small" startIcon={<Add />} onClick={addAssignment}>
                            Add Class
                        </Button>
                    </Box>

                    {assignments.map((assignment, index) => (
                        <Box key={index} sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
                            <TextField
                                size="small"
                                label="Class"
                                value={assignment.className}
                                onChange={(e) => updateAssignment(index, 'className', e.target.value)}
                                placeholder="e.g., Nursery, KG-1"
                                sx={{ flex: 1 }}
                            />
                            <TextField
                                size="small"
                                label="Division"
                                value={assignment.division}
                                onChange={(e) => updateAssignment(index, 'division', e.target.value)}
                                placeholder="e.g., A, B"
                                sx={{ width: 100 }}
                            />
                            <TextField
                                size="small"
                                label="Shift"
                                value={assignment.shiftName}
                                onChange={(e) => updateAssignment(index, 'shiftName', e.target.value)}
                                placeholder="Morning"
                                sx={{ width: 120 }}
                            />
                            <IconButton color="error" onClick={() => removeAssignment(index)}>
                                <Delete />
                            </IconButton>
                        </Box>
                    ))}

                    {assignments.length > 0 && (
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            {assignments.filter(a => a.className).map((a, i) => (
                                <Chip key={i} label={`${a.className}${a.division ? ` (${a.division})` : ''}`} size="small" />
                            ))}
                        </Box>
                    )}
                </Box>
            )}

            <Box sx={{ mt: 3 }}>
                <Button type="submit" variant="contained" size="large">
                    Add Staff Member
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
