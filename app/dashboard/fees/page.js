import { getAcademicYears } from '@/app/actions/academicYear';
import { getFeeRecords } from '@/app/actions/feeRecord';
import Link from 'next/link';
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
    Chip,
    Button
} from '@mui/material';

export default async function FeesDashboard({ searchParams }) {
    const years = await getAcademicYears();
    const { yearId } = await searchParams;
    const selectedYearId = yearId || (years.length > 0 ? years[0]._id : null);
    const records = selectedYearId ? await getFeeRecords(selectedYearId) : [];
    const selectedYearName = years.find(y => y._id === selectedYearId)?.name || 'None';

    return (
        <Box>
            <Typography variant="h4" gutterBottom fontWeight="bold">Fee Collection</Typography>

            <Box sx={{ mb: 4 }}>
                <Chip label={`Viewing: ${selectedYearName}`} color="primary" variant="outlined" />
            </Box>

            {records.length === 0 ? (
                <Typography color="text.secondary">No fee records found for this year.</Typography>
            ) : (
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Admission No</TableCell>
                                <TableCell>Student Name</TableCell>
                                <TableCell>Total Due</TableCell>
                                <TableCell>Total Paid</TableCell>
                                <TableCell>Balance</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Action</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {records.map((r) => {
                                const totalDue = r.fees.term1.amount + r.fees.term2.amount + r.fees.bookFee.amount;
                                const totalPaid = r.fees.term1.paid + r.fees.term2.paid + r.fees.bookFee.paid;
                                const balance = totalDue - totalPaid;
                                const isFullyPaid = balance <= 0;

                                return (
                                    <TableRow key={r._id}>
                                        <TableCell>{r.studentId.admissionNumber}</TableCell>
                                        <TableCell>{r.studentId.firstName} {r.studentId.lastName}</TableCell>
                                        <TableCell>{totalDue}</TableCell>
                                        <TableCell>{totalPaid}</TableCell>
                                        <TableCell sx={{ color: balance > 0 ? 'error.main' : 'success.main', fontWeight: 'bold' }}>
                                            {balance}
                                        </TableCell>
                                        <TableCell>
                                            {isFullyPaid ? (
                                                <Chip label="Paid" color="success" size="small" />
                                            ) : (
                                                <Chip label="Pending" color="warning" size="small" />
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Link href={`./fees/details?yearId=${selectedYearId}&studentId=${r.studentId._id}`} passHref>
                                                <Button variant="outlined" size="small">View / Pay</Button>
                                            </Link>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </Box>
    );
}
