'use client';

import { Paper, Typography, Box, Button } from '@mui/material';
import {
    Warning as WarningIcon,
    Error as ErrorIcon,
    Info as InfoIcon,
    ArrowForward as ArrowIcon
} from '@mui/icons-material';
import Link from 'next/link';
import { SvgIconComponent } from '@mui/icons-material';

type AlertType = 'warning' | 'error' | 'info';

interface Alert {
    type: AlertType;
    title: string;
    message: string;
    link?: string;
}

interface AlertsPanelProps {
    alerts?: Alert[];
}

interface AlertConfig {
    icon: SvgIconComponent;
    color: string;
    bgcolor: string;
    borderColor: string;
}

const alertConfig: Record<AlertType, AlertConfig> = {
    warning: {
        icon: WarningIcon,
        color: '#d97706',
        bgcolor: '#fffbeb',
        borderColor: '#fde68a',
    },
    error: {
        icon: ErrorIcon,
        color: '#e11d48',
        bgcolor: '#fff1f2',
        borderColor: '#fecdd3',
    },
    info: {
        icon: InfoIcon,
        color: '#4f46e5',
        bgcolor: '#f0f4ff',
        borderColor: '#c7d2fe',
    },
};

export default function AlertsPanel({ alerts = [] }: AlertsPanelProps) {
    if (!alerts || alerts.length === 0) {
        return (
            <Paper sx={{ p: 3, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <Typography
                    variant="h6"
                    sx={{
                        fontWeight: 600,
                        fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
                        color: '#1e293b',
                        mb: 2,
                    }}
                >
                    Alerts & Notifications
                </Typography>
                <Box
                    sx={{
                        p: 4,
                        textAlign: 'center',
                        bgcolor: '#f8fafc',
                        borderRadius: 2,
                    }}
                >
                    <Typography variant="body2" sx={{ color: '#64748b' }}>
                        No alerts at this time
                    </Typography>
                </Box>
            </Paper>
        );
    }

    return (
        <Paper sx={{ p: 3, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <Typography
                variant="h6"
                sx={{
                    fontWeight: 600,
                    fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
                    color: '#1e293b',
                    mb: 2,
                }}
            >
                Alerts & Notifications
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {alerts.map((alert, index) => {
                    const config = alertConfig[alert.type] || alertConfig.info;
                    const AlertIcon = config.icon;

                    return (
                        <Box
                            key={index}
                            sx={{
                                p: 2,
                                borderRadius: 2,
                                bgcolor: config.bgcolor,
                                border: `1px solid ${config.borderColor}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                            }}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <AlertIcon sx={{ fontSize: 20, color: config.color }} />
                                <Box>
                                    <Typography
                                        variant="body2"
                                        sx={{ fontWeight: 600, color: '#1e293b' }}
                                    >
                                        {alert.title}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: '#64748b' }}>
                                        {alert.message}
                                    </Typography>
                                </Box>
                            </Box>
                            {alert.link && (
                                <Link href={alert.link} style={{ textDecoration: 'none' }}>
                                    <Button
                                        size="small"
                                        endIcon={<ArrowIcon sx={{ fontSize: 16 }} />}
                                        sx={{
                                            color: config.color,
                                            fontSize: 12,
                                            '&:hover': {
                                                bgcolor: 'rgba(0,0,0,0.04)',
                                            },
                                        }}
                                    >
                                        View
                                    </Button>
                                </Link>
                            )}
                        </Box>
                    );
                })}
            </Box>
        </Paper>
    );
}
