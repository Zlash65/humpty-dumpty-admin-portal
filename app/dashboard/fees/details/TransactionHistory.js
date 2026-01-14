'use client';

import { useState } from 'react';
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
    IconButton,
    Tooltip
} from '@mui/material';
import { Print as PrintIcon } from '@mui/icons-material';
import ReceiptModal from '@/components/ReceiptModal';

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

export default function TransactionHistory({ transactions, student, settings }) {
    const [receiptOpen, setReceiptOpen] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState(null);

    const handlePrintReceipt = (transaction) => {
        setSelectedTransaction(transaction);
        setReceiptOpen(true);
    };

    const handleCloseReceipt = () => {
        setReceiptOpen(false);
        setSelectedTransaction(null);
    };

    return (
        <Box sx={{ mt: 4 }}>
            <Typography variant="h5" gutterBottom>Transaction History</Typography>
            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Receipt</TableCell>
                            <TableCell>Date</TableCell>
                            <TableCell>Amount</TableCell>
                            <TableCell>Mode</TableCell>
                            <TableCell>Ref</TableCell>
                            <TableCell>Month</TableCell>
                            <TableCell>Breakdown (T1 / T2 / Book)</TableCell>
                            <TableCell align="center">Print</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {transactions.map((t) => (
                            <TableRow key={t._id}>
                                <TableCell>{t.receiptNumber || '-'}</TableCell>
                                <TableCell>{formatDate(t.date)}</TableCell>
                                <TableCell>₹{t.amount?.toLocaleString('en-IN') || '0'}</TableCell>
                                <TableCell>{t.paymentMode}</TableCell>
                                <TableCell>{t.reference || '-'}</TableCell>
                                <TableCell>{t.monthYear || '-'}</TableCell>
                                <TableCell>
                                    {t.breakdown?.term1 || 0} / {t.breakdown?.term2 || 0} / {t.breakdown?.bookFee || 0}
                                </TableCell>
                                <TableCell align="center">
                                    <Tooltip title="Print Receipt">
                                        <IconButton
                                            size="small"
                                            onClick={() => handlePrintReceipt(t)}
                                            sx={{
                                                color: '#4f46e5',
                                                '&:hover': { bgcolor: '#eef2ff' }
                                            }}
                                        >
                                            <PrintIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </TableCell>
                            </TableRow>
                        ))}
                        {transactions.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={8} align="center" sx={{ py: 4, color: '#64748b' }}>
                                    No transactions recorded yet
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            <ReceiptModal
                open={receiptOpen}
                onClose={handleCloseReceipt}
                transaction={selectedTransaction}
                student={student}
                settings={settings}
            />
        </Box>
    );
}
