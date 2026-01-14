'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    Box,
    Typography,
    Grid,
    Chip,
    Paper,
    CircularProgress,
    Alert,
    Tooltip,
} from '@mui/material';
import { teal, green, grey } from '@mui/material/colors';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/Pending';
import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupee';
import { getStudentMonthsStatus } from '@/app/actions/feeRecord';

const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
];

export default function MonthlyFeeTracker({ studentId, academicYearId, onError }) {
    const [monthsStatus, setMonthsStatus] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const run = async () => {
            if (!studentId || !academicYearId) {
                setMonthsStatus({});
                return;
            }
            setLoading(true);
            setError('');
            try {
                const res = await getStudentMonthsStatus(studentId, academicYearId);
                if (res?.success) {
                    setMonthsStatus(res.monthsStatus || {});
                } else {
                    const msg = res?.error || 'Failed to fetch months status';
                    setError(msg);
                    onError?.(msg);
                }
            } catch (e) {
                const msg = e?.message || 'Failed to fetch months status';
                setError(msg);
                onError?.(msg);
            } finally {
                setLoading(false);
            }
        };
        run();
    }, [studentId, academicYearId, onError]);

    const latestPaidMonthIndex = useMemo(() => {
        for (let i = MONTHS.length - 1; i >= 0; i--) {
            const m = MONTHS[i];
            const status = monthsStatus?.[m];
            if (status?.paid) return i;
        }
        return -1;
    }, [monthsStatus]);

    const shouldMonthBePaid = (monthIndex) => monthIndex <= latestPaidMonthIndex;

    const formatAmount = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN')}`;

    const totalPaidAmount = useMemo(() => {
        return Object.values(monthsStatus || {}).reduce((total, status) => total + (Number(status?.amount) || 0), 0);
    }, [monthsStatus]);

    const paidMonthsCount = latestPaidMonthIndex >= 0 ? latestPaidMonthIndex + 1 : 0;

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                <CircularProgress size={24} />
                <Typography sx={{ ml: 2 }}>Loading months status...</Typography>
            </Box>
        );
    }

    if (error) {
        return (
            <Alert severity="error" sx={{ m: 2 }}>
                {error}
            </Alert>
        );
    }

    return (
        <Paper elevation={2} sx={{ p: 3, mt: 2 }}>
            <Box sx={{ mb: 3 }}>
                <Typography variant="h6" sx={{ color: teal[700], fontWeight: 600, mb: 1 }}>
                    Monthly Fee Payment Status
                </Typography>

                <Box sx={{ display: 'flex', gap: 3, mb: 2, flexWrap: 'wrap' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CheckCircleIcon sx={{ color: green[500], fontSize: 20 }} />
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            Paid Months: {paidMonthsCount}/12
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CurrencyRupeeIcon sx={{ color: teal[600], fontSize: 20 }} />
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            Total Paid: {formatAmount(totalPaidAmount)}
                        </Typography>
                    </Box>
                </Box>
            </Box>

            <Grid container spacing={1.5}>
                {MONTHS.map((month, index) => {
                    const status = monthsStatus?.[month];
                    const isPaid = !!status?.paid;
                    const sequentialPaid = shouldMonthBePaid(index);
                    const displayAsPaid = isPaid || sequentialPaid;
                    const amount = Number(status?.amount) || 0;
                    const paidDate = status?.paid_date || null;

                    return (
                        <Grid item xs={6} sm={4} md={3} key={month}>
                            <Tooltip
                                title={
                                    displayAsPaid
                                        ? `Paid: ${formatAmount(amount)}${paidDate ? ` on ${paidDate}` : ''}${sequentialPaid && !isPaid ? ' (Sequential)' : ''}`
                                        : 'Not paid yet'
                                }
                                arrow
                                placement="top"
                            >
                                <Chip
                                    icon={displayAsPaid ? <CheckCircleIcon fontSize="small" /> : <PendingIcon fontSize="small" />}
                                    label={
                                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                            <Typography variant="caption" sx={{ fontWeight: 600, lineHeight: 1 }}>
                                                {month.substring(0, 3)}
                                            </Typography>
                                            {displayAsPaid && (
                                                <Typography variant="caption" sx={{ fontSize: '0.65rem', lineHeight: 1 }}>
                                                    {formatAmount(amount)}
                                                </Typography>
                                            )}
                                        </Box>
                                    }
                                    sx={{
                                        width: '100%',
                                        height: 48,
                                        backgroundColor: displayAsPaid ? green[500] : grey[300],
                                        color: displayAsPaid ? 'white' : grey[600],
                                        fontWeight: 600,
                                        border: displayAsPaid ? `2px solid ${green[600]}` : `1px solid ${grey[400]}`,
                                        '&:hover': { backgroundColor: displayAsPaid ? green[600] : grey[400] },
                                        '& .MuiChip-icon': { color: displayAsPaid ? 'white' : grey[600] },
                                    }}
                                />
                            </Tooltip>
                        </Grid>
                    );
                })}
            </Grid>

            <Box sx={{ mt: 3, display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <CheckCircleIcon sx={{ color: green[500], fontSize: 16 }} />
                    <Typography variant="caption">Paid</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <PendingIcon sx={{ color: grey[500], fontSize: 16 }} />
                    <Typography variant="caption">Pending</Typography>
                </Box>
            </Box>
        </Paper>
    );
}

