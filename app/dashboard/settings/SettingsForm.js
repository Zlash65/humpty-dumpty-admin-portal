'use client';

import { useState } from 'react';
import {
    Box,
    Paper,
    Typography,
    TextField,
    Button,
    Grid,
    Alert,
    Divider,
    CircularProgress,
} from '@mui/material';
import {
    Settings as SettingsIcon,
    Save as SaveIcon,
    Business as BusinessIcon,
    Phone as PhoneIcon,
    Email as EmailIcon,
} from '@mui/icons-material';
import { updateSettings } from '@/app/actions/settings';

export default function SettingsForm({ initialSettings }) {
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [severity, setSeverity] = useState('success');

    async function handleSubmit(e) {
        e.preventDefault();
        setSaving(true);
        setMessage('');

        const formData = new FormData(e.target);
        const result = await updateSettings(formData);

        if (result.error) {
            setMessage(result.error);
            setSeverity('error');
        } else {
            setMessage('Settings saved successfully');
            setSeverity('success');
        }

        setSaving(false);
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
                <Box
                    sx={{
                        width: 48,
                        height: 48,
                        borderRadius: 2,
                        bgcolor: '#f0f4ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <SettingsIcon sx={{ fontSize: 24, color: '#4f46e5' }} />
                </Box>
                <Box>
                    <Typography
                        variant="h4"
                        sx={{
                            fontWeight: 700,
                            fontFamily: 'var(--font-nunito), \"Nunito\", sans-serif',
                            color: '#1e293b',
                        }}
                    >
                        Settings
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#64748b' }}>
                        Configure your school information
                    </Typography>
                </Box>
            </Box>

            {message && (
                <Alert severity={severity} sx={{ mb: 3 }} onClose={() => setMessage('')}>
                    {message}
                </Alert>
            )}

            <form onSubmit={handleSubmit}>
                <Paper sx={{ p: 3, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', mb: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                        <BusinessIcon sx={{ color: '#4f46e5' }} />
                        <Typography variant="h6" sx={{ fontWeight: 600, color: '#1e293b' }}>
                            School Information
                        </Typography>
                    </Box>
                    <Divider sx={{ mb: 3 }} />

                    <Grid container spacing={3}>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                fullWidth
                                label="School Name"
                                name="schoolName"
                                defaultValue={initialSettings?.schoolName}
                                required
                                helperText="Displayed in header and receipts"
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                fullWidth
                                label="Tagline"
                                name="schoolTagline"
                                defaultValue={initialSettings?.schoolTagline}
                                helperText="Displayed on login page"
                            />
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                            <TextField
                                fullWidth
                                label="Address"
                                name="address"
                                defaultValue={initialSettings?.address}
                                multiline
                                rows={2}
                                helperText="Full address for receipts"
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                fullWidth
                                label="Logo URL"
                                name="logoUrl"
                                defaultValue={initialSettings?.logoUrl}
                                helperText="URL to school logo image (optional)"
                            />
                        </Grid>
                    </Grid>
                </Paper>

                <Paper sx={{ p: 3, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', mb: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                        <PhoneIcon sx={{ color: '#059669' }} />
                        <Typography variant="h6" sx={{ fontWeight: 600, color: '#1e293b' }}>
                            Contact Information
                        </Typography>
                    </Box>
                    <Divider sx={{ mb: 3 }} />

                    <Grid container spacing={3}>
                        <Grid size={{ xs: 12, md: 4 }}>
                            <TextField
                                fullWidth
                                label="Primary Phone"
                                name="phone"
                                defaultValue={initialSettings?.phone}
                                helperText="Main contact number"
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 4 }}>
                            <TextField
                                fullWidth
                                label="Phone 2"
                                name="phone2"
                                defaultValue={initialSettings?.phone2}
                                helperText="Secondary number (optional)"
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 4 }}>
                            <TextField
                                fullWidth
                                label="Phone 3"
                                name="phone3"
                                defaultValue={initialSettings?.phone3}
                                helperText="Additional number (optional)"
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                fullWidth
                                label="Email Address"
                                name="email"
                                type="email"
                                defaultValue={initialSettings?.email}
                                InputProps={{
                                    startAdornment: <EmailIcon sx={{ color: '#94a3b8', mr: 1 }} />,
                                }}
                            />
                        </Grid>
                    </Grid>
                </Paper>

                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                        type="submit"
                        variant="contained"
                        size="large"
                        disabled={saving}
                        startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
                        sx={{
                            bgcolor: '#4f46e5',
                            '&:hover': { bgcolor: '#4338ca' },
                            px: 4,
                        }}
                    >
                        {saving ? 'Saving...' : 'Save Settings'}
                    </Button>
                </Box>
            </form>
        </Box>
    );
}

