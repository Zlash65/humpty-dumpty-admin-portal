'use client';

import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Grid,
    Typography,
    Divider,
    Box,
    Chip
} from '@mui/material';
import { Person, Phone, Home, School, AttachMoney } from '@mui/icons-material';

// Format date consistently to avoid hydration mismatch
function formatDate(dateStr) {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function InfoRow({ label, value, icon }) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 1.5 }}>
            {icon && <Box sx={{ mr: 1, color: 'primary.main', mt: 0.3 }}>{icon}</Box>}
            <Box>
                <Typography variant="caption" color="text.secondary" display="block">
                    {label}
                </Typography>
                <Typography variant="body2">
                    {value || '-'}
                </Typography>
            </Box>
        </Box>
    );
}

export default function ViewStudentModal({ student, open, onClose }) {
    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Person color="primary" />
                    <Box>
                        <Typography variant="h6">
                            {student.firstName} {student.lastName}
                        </Typography>
                        <Chip
                            label={student.admissionNumber}
                            size="small"
                            color="primary"
                            variant="outlined"
                        />
                    </Box>
                </Box>
            </DialogTitle>
            <DialogContent dividers>
                <Typography variant="subtitle2" color="primary" gutterBottom sx={{ mb: 2 }}>
                    Personal Information
                </Typography>
                <Grid container spacing={2}>
                    <Grid size={{ xs: 6 }}>
                        <InfoRow label="Date of Birth" value={formatDate(student.dob)} />
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                        <InfoRow label="Gender" value={student.gender} />
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                        <InfoRow label="Place of Birth" value={student.birthPlace} />
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                        <InfoRow label="Religion" value={student.religion} />
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                        <InfoRow label="Address" value={student.address} icon={<Home fontSize="small" />} />
                    </Grid>
                </Grid>

                <Divider sx={{ my: 2 }} />

                <Typography variant="subtitle2" color="primary" gutterBottom sx={{ mb: 2 }}>
                    Parent/Guardian Information
                </Typography>
                <Grid container spacing={2}>
                    <Grid size={{ xs: 6 }}>
                        <InfoRow label="Father's Name" value={student.fatherName} />
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                        <InfoRow label="Mother's Name" value={student.motherName} />
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                        <InfoRow label="Primary Contact" value={student.parentContact1} icon={<Phone fontSize="small" />} />
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                        <InfoRow label="Secondary Contact" value={student.parentContact2} icon={<Phone fontSize="small" />} />
                    </Grid>
                </Grid>

                <Divider sx={{ my: 2 }} />

                <Typography variant="subtitle2" color="primary" gutterBottom sx={{ mb: 2 }}>
                    Academic & Financial
                </Typography>
                <Grid container spacing={2}>
                    <Grid size={{ xs: 6 }}>
                        <InfoRow label="Branch" value={student.branchName} icon={<School fontSize="small" />} />
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                        <InfoRow
                            label="Scholarship"
                            value={student.feeScholarship ? `₹${student.feeScholarship.toLocaleString()}` : 'None'}
                            icon={<AttachMoney fontSize="small" />}
                        />
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                        <InfoRow label="Joined On" value={formatDate(student.joinedAt)} />
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                        <InfoRow label="Status" value={
                            <Chip
                                label={student.isActive ? 'Active' : 'Inactive'}
                                size="small"
                                color={student.isActive ? 'success' : 'default'}
                            />
                        } />
                    </Grid>
                </Grid>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    );
}
