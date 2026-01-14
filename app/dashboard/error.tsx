'use client';

import { Box, Button, Typography, Paper } from '@mui/material';
import { ErrorOutline as ErrorIcon, Refresh as RefreshIcon, Home as HomeIcon } from '@mui/icons-material';
import Link from 'next/link';

interface DashboardErrorProps {
    error: Error & { digest?: string };
    reset: () => void;
}

export default function DashboardError({ error, reset }: DashboardErrorProps) {
    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 'calc(100vh - 200px)',
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
                    Oops! Something went wrong
                </Typography>

                <Typography variant="body1" sx={{ color: '#64748b', mb: 4 }}>
                    {error?.message || 'We encountered an error while loading this page.'}
                </Typography>

                <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
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
                    <Link href="/dashboard" style={{ textDecoration: 'none' }}>
                        <Button
                            variant="outlined"
                            startIcon={<HomeIcon />}
                            sx={{
                                borderColor: '#e2e8f0',
                                color: '#64748b',
                                '&:hover': {
                                    borderColor: '#4f46e5',
                                    color: '#4f46e5',
                                },
                            }}
                        >
                            Go to Dashboard
                        </Button>
                    </Link>
                </Box>
            </Paper>
        </Box>
    );
}
