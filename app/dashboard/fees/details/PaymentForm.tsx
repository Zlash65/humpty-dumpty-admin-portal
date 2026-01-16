'use client';

import { recordPayment } from '@/app/actions/feeRecord';
import { useMemo, useRef, useState, ChangeEvent } from 'react';
import {
    Box,
    Button,
    TextField,
    Alert,
    Grid,
    Typography,
    Card,
    CardContent
} from '@mui/material';
import { AlertColor } from '@mui/material/Alert';
import SearchableSelect, { type SearchableSelectOption } from '@/components/ui/SearchableSelect';

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
] as const;

interface Outstanding {
    term1: number;
    term2: number;
    bookFee: number;
}

interface PaymentFormProps {
    academicYearId: string;
    studentId: string;
    outstanding: Outstanding;
}

interface Breakdown {
    term1: number;
    term2: number;
    bookFee: number;
}

export default function PaymentForm({ academicYearId, studentId, outstanding }: PaymentFormProps) {
    const formRef = useRef<HTMLFormElement>(null);
    const [message, setMessage] = useState('');
    const [severity, setSeverity] = useState<AlertColor>('info');

    const [amount, setAmount] = useState('');
    const [breakdown, setBreakdown] = useState<Breakdown>({ term1: 0, term2: 0, bookFee: 0 });
    const [paymentMode, setPaymentMode] = useState('Cash');
    const [monthYear, setMonthYear] = useState('');

    const paymentModeOptions = useMemo<SearchableSelectOption[]>(
        () => [
            { value: 'Cash', label: 'Cash', keywords: 'cash' },
            { value: 'Bank Transfer', label: 'Bank Transfer', keywords: 'bank transfer' },
            { value: 'Cheque', label: 'Cheque', keywords: 'cheque check' },
            { value: 'UPI', label: 'UPI', keywords: 'upi' },
        ],
        []
    );

    const monthOptions = useMemo<SearchableSelectOption[]>(
        () => MONTHS.map((m) => ({ value: m, label: m, keywords: m })),
        []
    );

    const handleAmountChange = (val: string) => {
        const amt = parseFloat(val) || 0;
        setAmount(val);

        let remaining = amt;
        const t1 = Math.min(remaining, outstanding.term1);
        remaining -= t1;
        const bk = Math.min(remaining, outstanding.bookFee);
        remaining -= bk;
        const t2 = Math.min(remaining, outstanding.term2);

        setBreakdown({ term1: t1, bookFee: bk, term2: t2 });
    };

    async function action(formData: FormData) {
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
            setMonthYear('');
        }
    }

    return (
        <Box component="form" ref={formRef} action={action} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <input type="hidden" name="academicYearId" value={academicYearId} />
            <input type="hidden" name="studentId" value={studentId} />

            <TextField
                id="payment-amount"
                name="amount"
                label="Total Amount"
                type="number"
                fullWidth
                required
                value={amount}
                onChange={(e: ChangeEvent<HTMLInputElement>) => handleAmountChange(e.target.value)}
                inputProps={{ min: 0, step: 0.01 }}
            />

            <SearchableSelect
                id="payment-mode"
                name="paymentMode"
                label="Payment Mode"
                placeholder="Select"
                size="medium"
                value={paymentMode}
                onChange={setPaymentMode}
                options={paymentModeOptions}
                required
                disableClearable
                listboxMaxHeight={240}
            />

            <SearchableSelect
                id="payment-month"
                name="monthYear"
                label="Month (Optional)"
                placeholder="-"
                size="medium"
                value={monthYear}
                onChange={setMonthYear}
                options={monthOptions}
                listboxMaxHeight={240}
                helperText="For monthly tracking (matches Electron month-wise view)"
            />

            <TextField
                id="payment-reference"
                name="reference"
                label="Reference (Optional)"
                fullWidth
            />

            {paymentMode === 'UPI' && (
                <Card variant="outlined" sx={{ bgcolor: 'background.default' }}>
                    <CardContent>
                        <Typography variant="subtitle2" gutterBottom>
                            UPI Details
                        </Typography>
                        <Grid container spacing={2}>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                    id="payment-upi-id"
                                    name="upiId"
                                    label="UPI ID / VPA (Optional)"
                                    fullWidth
                                    placeholder="user@paytm, user@gpay, etc."
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                    id="payment-upi-reference"
                                    name="upiReference"
                                    label="UPI Transaction ID (Optional)"
                                    fullWidth
                                    placeholder="Transaction reference number"
                                />
                            </Grid>
                            <Grid size={{ xs: 12 }}>
                                <TextField id="payment-upi-payee-name" name="payeeName" label="Payee Name (Optional)" fullWidth />
                            </Grid>
                        </Grid>
                    </CardContent>
                </Card>
            )}

            {(paymentMode === 'Bank Transfer' || paymentMode === 'Cheque') && (
                <Card variant="outlined" sx={{ bgcolor: 'background.default' }}>
                    <CardContent>
                        <Typography variant="subtitle2" gutterBottom>
                            Bank / Cheque Details
                        </Typography>
                        <Grid container spacing={2}>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField id="payment-bank-name" name="bankName" label="Bank Name (Optional)" fullWidth />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField id="payment-bank-payee-name" name="payeeName" label="Payee Name (Optional)" fullWidth />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField id="payment-cheque-number" name="chequeNumber" label="Cheque No. (Optional)" fullWidth />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <TextField
                                    id="payment-cheque-date"
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
                        <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField
                                id="payment-breakdown-term1"
                                label={`Term 1 (Due: ${outstanding.term1})`}
                                name="breakdownTerm1"
                                type="number"
                                fullWidth
                                inputProps={{ min: 0, step: 0.01 }}
                                value={breakdown.term1}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setBreakdown({ ...breakdown, term1: parseFloat(e.target.value) || 0 })}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField
                                id="payment-breakdown-term2"
                                label={`Term 2 (Due: ${outstanding.term2})`}
                                name="breakdownTerm2"
                                type="number"
                                fullWidth
                                inputProps={{ min: 0, step: 0.01 }}
                                value={breakdown.term2}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setBreakdown({ ...breakdown, term2: parseFloat(e.target.value) || 0 })}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField
                                id="payment-breakdown-book-fee"
                                label={`Book Fee (Due: ${outstanding.bookFee})`}
                                name="breakdownBookFee"
                                type="number"
                                fullWidth
                                inputProps={{ min: 0, step: 0.01 }}
                                value={breakdown.bookFee}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setBreakdown({ ...breakdown, bookFee: parseFloat(e.target.value) || 0 })}
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
