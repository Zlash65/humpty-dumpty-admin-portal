'use client';

import { recordPayment } from '@/app/actions/feeRecord';
import { useRef, useState } from 'react';
import {
    Box,
    Button,
    TextField,
    Alert,
    Grid,
    MenuItem,
    Typography,
    Card,
    CardContent
} from '@mui/material';

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

export default function PaymentForm({ academicYearId, studentId, outstanding }) {
    const formRef = useRef(null);
    const [message, setMessage] = useState('');
    const [severity, setSeverity] = useState('info');

    const [amount, setAmount] = useState('');
    const [breakdown, setBreakdown] = useState({ term1: 0, term2: 0, bookFee: 0 });
    const [paymentMode, setPaymentMode] = useState('Cash');

    const handleAmountChange = (val) => {
        const amt = parseFloat(val) || 0;
        setAmount(val);

        let remaining = amt;
        let t1 = Math.min(remaining, outstanding.term1);
        remaining -= t1;
        let bk = Math.min(remaining, outstanding.bookFee);
        remaining -= bk;
        let t2 = Math.min(remaining, outstanding.term2);

        setBreakdown({ term1: t1, bookFee: bk, term2: t2 });
    };

    async function action(formData) {
        const res = await recordPayment(formData);
        if (res.error) {
            setMessage(res.error);
            setSeverity('error');
        } else {
            setMessage(`Payment recorded successfully${res.receiptNumber ? ` (Receipt: ${res.receiptNumber})` : '!'}`);
            setSeverity('success');
            formRef.current?.reset();
            setAmount('');
            setBreakdown({ term1: 0, term2: 0, bookFee: 0 });
            setPaymentMode('Cash');
        }
    }

    return (
        <Box component="form" ref={formRef} action={action} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <input type="hidden" name="academicYearId" value={academicYearId} />
            <input type="hidden" name="studentId" value={studentId} />

            <TextField
                name="amount"
                label="Total Amount"
                type="number"
                fullWidth
                required
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                inputProps={{ min: 0, step: 0.01 }}
            />

            <TextField
                select
                name="paymentMode"
                label="Payment Mode"
                fullWidth
                required
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
            >
                <MenuItem value="Cash">Cash</MenuItem>
                <MenuItem value="Bank Transfer">Bank Transfer</MenuItem>
                <MenuItem value="Cheque">Cheque</MenuItem>
            </TextField>

            <TextField
                select
                name="monthYear"
                label="Month (Optional)"
                fullWidth
                defaultValue=""
                helperText="For monthly tracking (matches Electron month-wise view)"
            >
                <MenuItem value="">—</MenuItem>
                {MONTHS.map((m) => (
                    <MenuItem key={m} value={m}>{m}</MenuItem>
                ))}
            </TextField>

            <TextField
                name="reference"
                label="Reference (Optional)"
                fullWidth
            />

            {paymentMode !== 'Cash' && (
                <Card variant="outlined" sx={{ bgcolor: 'background.default' }}>
                    <CardContent>
                        <Typography variant="subtitle2" gutterBottom>
                            Bank / Cheque Details
                        </Typography>
                        <Grid container spacing={2}>
                            <Grid item xs={12} sm={6}>
                                <TextField name="bankName" label="Bank Name (Optional)" fullWidth />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField name="payeeName" label="Payee Name (Optional)" fullWidth />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField name="chequeNumber" label="Cheque No. (Optional)" fullWidth />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    name="chequeDate"
                                    label="Cheque Date (Optional)"
                                    type="date"
                                    fullWidth
                                    slotProps={{ inputLabel: { shrink: true } }}
                                />
                            </Grid>
                        </Grid>
                    </CardContent>
                </Card>
            )}

            <Card variant="outlined" sx={{ bgcolor: 'background.default' }}>
                <CardContent>
                    <Typography variant="subtitle2" gutterBottom>Allocation Breakdown</Typography>
                    <Grid container spacing={2}>
                        <Grid item xs={12} sm={4}>
                            <TextField
                                label={`Term 1 (Due: ${outstanding.term1})`}
                                name="breakdownTerm1"
                                type="number"
                                fullWidth
                                inputProps={{ min: 0, step: 0.01 }}
                                value={breakdown.term1}
                                onChange={e => setBreakdown({ ...breakdown, term1: parseFloat(e.target.value) })}
                            />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <TextField
                                label={`Term 2 (Due: ${outstanding.term2})`}
                                name="breakdownTerm2"
                                type="number"
                                fullWidth
                                inputProps={{ min: 0, step: 0.01 }}
                                value={breakdown.term2}
                                onChange={e => setBreakdown({ ...breakdown, term2: parseFloat(e.target.value) })}
                            />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <TextField
                                label={`Book Fee (Due: ${outstanding.bookFee})`}
                                name="breakdownBookFee"
                                type="number"
                                fullWidth
                                inputProps={{ min: 0, step: 0.01 }}
                                value={breakdown.bookFee}
                                onChange={e => setBreakdown({ ...breakdown, bookFee: parseFloat(e.target.value) })}
                            />
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>

            <Button type="submit" variant="contained" size="large">
                Record Payment
            </Button>

            {message && <Alert severity={severity}>{message}</Alert>}
        </Box>
    );
}
