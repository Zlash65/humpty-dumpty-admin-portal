import { getStudentFeeRecord } from '@/app/actions/feeRecord';
import { getSettings } from '@/app/actions/settings';
import PaymentForm from './PaymentForm';
import TransactionHistory from './TransactionHistory';

import {
    Box,
    Typography,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Grid,
    Divider,
    Chip
} from '@mui/material';

export default async function FeeDetailsPage({ searchParams }) {
    const { yearId, studentId } = await searchParams;
    if (!yearId || !studentId) return <Typography>Invalid parameters.</Typography>;

    const [record, settings] = await Promise.all([
        getStudentFeeRecord(yearId, studentId),
        getSettings()
    ]);
    if (!record) return <Typography>Fee record not found.</Typography>;

    const totalDue = record.fees.term1.amount + record.fees.term2.amount + record.fees.bookFee.amount;
    const totalPaid = record.fees.term1.paid + record.fees.term2.paid + record.fees.bookFee.paid;
    const balance = totalDue - totalPaid;

    return (
        <Box>
            <Typography variant="h4" fontWeight="bold">
                {record.studentId.firstName} {record.studentId.lastName}
            </Typography>
            <Typography variant="subtitle1" color="text.secondary" gutterBottom>
                Academic Year: {record.academicYearId.name}
            </Typography>

            <Grid container spacing={3} sx={{ mt: 2 }}>
                {/* Summary Card */}
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 3, height: '100%' }}>
                        <Typography variant="h6" gutterBottom>Fee Status</Typography>

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                            <Typography>Total Due:</Typography>
                            <Typography fontWeight="bold">{totalDue}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                            <Typography>Total Paid:</Typography>
                            <Typography fontWeight="bold">{totalPaid}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                            <Typography>Balance:</Typography>
                            <Typography fontWeight="bold" color={balance > 0 ? 'error.main' : 'success.main'}>
                                {balance}
                            </Typography>
                        </Box>

                        <Divider sx={{ my: 2 }} />

                        <Typography variant="subtitle2" gutterBottom>Breakdown</Typography>
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Head</TableCell>
                                        <TableCell align="right">Amount</TableCell>
                                        <TableCell align="right">Paid</TableCell>
                                        <TableCell align="right">Status</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {['term1', 'term2', 'bookFee'].map(head => (
                                        <TableRow key={head}>
                                            <TableCell sx={{ textTransform: 'capitalize' }}>{head}</TableCell>
                                            <TableCell align="right">{record.fees[head].amount}</TableCell>
                                            <TableCell align="right">{record.fees[head].paid}</TableCell>
                                            <TableCell align="right">
                                                <Chip
                                                    label={record.fees[head].status}
                                                    size="small"
                                                    color={record.fees[head].status === 'Paid' ? 'success' : 'default'}
                                                    variant="outlined"
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </Grid>

                {/* Payment Form */}
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 3, height: '100%' }}>
                        <Typography variant="h6" gutterBottom>Record Payment</Typography>
                        <PaymentForm
                            academicYearId={yearId}
                            studentId={studentId}
                            outstanding={{
                                term1: record.fees.term1.amount - record.fees.term1.paid,
                                term2: record.fees.term2.amount - record.fees.term2.paid,
                                bookFee: record.fees.bookFee.amount - record.fees.bookFee.paid,
                            }}
                        />
                    </Paper>
                </Grid>
            </Grid>

            <TransactionHistory
                transactions={record.transactions}
                student={{
                    firstName: record.studentId.firstName,
                    lastName: record.studentId.lastName,
                    className: record.enrollment?.class || '',
                    shift: record.enrollment?.shiftName || '',
                    branchName: record.branchName || '',
                }}
                settings={settings}
            />
        </Box>
    );
}
