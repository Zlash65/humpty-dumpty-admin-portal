'use client';

import { Box, Button, Typography, Paper } from '@mui/material';
import { ErrorOutline as ErrorIcon, Refresh as RefreshIcon } from '@mui/icons-material';

export default function Error({ error, reset }) {
    return (
        <Box
            sx={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: '#f8fafc',
                p: 4,
            }}
        >
            <Paper
                sx={{
                    p: 6,
                    maxWidth: 500,
                    textAlign: 'center',
                    border: '1px solid #e2e8f0',
                }}
            >
                <Box
                    sx={{
                        width: 80,
                        height: 80,
                        borderRadius: '50%',
                        bgcolor: '#fff1f2',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        mx: 'auto',
                        mb: 3,
                    }}
                >
                    <ErrorIcon sx={{ fontSize: 40, color: '#e11d48' }} />
                </Box>

                <Typography
                    variant="h5"
                    sx={{
                        fontWeight: 700,
                        fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
                        color: '#1e293b',
                        mb: 2,
                    }}
                >
                    Something went wrong
                </Typography>

                <Typography variant="body1" sx={{ color: '#64748b', mb: 4 }}>
                    {error?.message || 'An unexpected error occurred. Please try again.'}
                </Typography>

                <Button
                    variant="contained"
                    startIcon={<RefreshIcon />}
                    onClick={reset}
                    sx={{
                        bgcolor: '#4f46e5',
                        '&:hover': { bgcolor: '#4338ca' },
                    }}
                >
                    Try Again
                </Button>
            </Paper>
        </Box>
    );
}
