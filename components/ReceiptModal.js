'use client';

import { useMemo } from 'react';
import {
    Box,
    Typography,
    Button,
    Divider,
    Dialog,
    DialogContent,
    DialogActions,
    GlobalStyles,
    Grid
} from '@mui/material';
import {
    Print as PrintIcon,
    Close as CloseIcon,
    School as SchoolIcon
} from '@mui/icons-material';

// Helper to normalize receipt numbers (c1 -> C-1, b2 -> B-2)
const normalizeReceipt = (raw) => {
    if (!raw) return '';
    const s = String(raw);
    if (/^[cb]\d+$/i.test(s)) return `${s[0].toUpperCase()}-${s.slice(1)}`;
    return s;
};

// Convert date formats to month name
const toMonthName = (val) => {
    if (!val) return null;
    const s = String(val).trim();

    // Try ISO format YYYY-MM
    let m = s.match(/^(\d{4})[-.](\d{1,2})$/);
    if (m) {
        const monthIdx = Math.max(0, Math.min(11, parseInt(m[2], 10) - 1));
        return new Date(2000, monthIdx, 1).toLocaleString('en-IN', { month: 'long' });
    }

    // Try MM-YYYY
    m = s.match(/^(\d{1,2})[-.](\d{4})$/);
    if (m) {
        const monthIdx = Math.max(0, Math.min(11, parseInt(m[1], 10) - 1));
        return new Date(2000, monthIdx, 1).toLocaleString('en-IN', { month: 'long' });
    }

    // Check if already contains month name
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december'];
    const lower = s.toLowerCase();
    const found = monthNames.find(mn => lower.includes(mn));
    if (found) return found.charAt(0).toUpperCase() + found.slice(1);

    return null;
};

const displayUptoMonth = (monthYear) => {
    const name = toMonthName(monthYear);
    return name ? `Upto ${name}` : monthYear ? `Upto ${monthYear}` : '-';
};

// Receipt layout constants (kept close to the Electron receipt so print output matches visually)
const LABEL_TEXT_W = 72; // px
const COL_W = 8; // px
const LABEL_PAD = 2; // px
const VALUE_PAD = 6; // px
const MID_LABEL_TEXT_W = 60; // px
const MID_COL_W = 6; // px
const MID_VALUE_PAD = 4; // px
const COL1_W = 260; // px
const COL2_W = 220; // px
const COL3_W = 220; // px

const Label = ({ children }) => (
    <Typography sx={{ fontSize: 14, fontWeight: 400, mr: 0.5 }}>
        {children}
    </Typography>
);

const Underline = ({ children, width = 200, align = 'left' }) => (
    <Box
        sx={{
            borderBottom: '0 none',
            minWidth: width,
            height: 22,
            display: 'flex',
            alignItems: 'flex-end',
            px: 0.25,
            justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        }}
    >
        <Typography
            sx={{
                fontSize: 16,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
            }}
        >
            {children}
        </Typography>
    </Box>
);

const Field = ({
    label,
    children,
    labelTextW = LABEL_TEXT_W,
    colonW = COL_W,
    valuePad = VALUE_PAD,
}) => (
    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
        <Box sx={{ width: labelTextW, pr: `${LABEL_PAD}px` }}>
            <Label>{label}</Label>
        </Box>
        <Box sx={{ width: colonW, display: 'flex', justifyContent: 'center' }}>
            <Label>:</Label>
        </Box>
        <Box sx={{ flex: 1, pl: `${valuePad}px` }}>{children}</Box>
    </Box>
);

// Single receipt copy
const ReceiptCopy = ({ data, settings }) => {
    const schoolName = data.branchName || settings?.schoolName || 'School';
    const tagline = settings?.schoolTagline || '';
    const address = settings?.address || '';
    const phone = settings?.phone || '';
    const phone2 = settings?.phone2 || '';
    const phone3 = settings?.phone3 || '';
    const logoUrl = settings?.logoUrl || '';

    const paymentModeRaw = String(data.paymentMode || '').toLowerCase();
    const isCash = paymentModeRaw.includes('cash');
    const isUPI = paymentModeRaw.includes('upi');
    const isCheque = paymentModeRaw.includes('cheque') || paymentModeRaw.includes('bank');

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        // Electron stores payment_date as a date-only string (YYYY-MM-DD).
        // `new Date('YYYY-MM-DD')` is parsed as UTC and can shift a day in some timezones,
        // so handle date-only inputs explicitly in local time.
        const date = (() => {
            const s = String(dateStr).trim();
            const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
            return new Date(s);
        })();
        return date.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).replace(/\//g, '-');
    };

    return (
        <Box
            className="receipt"
            sx={{
                width: 700,
                mx: 'auto',
                bgcolor: '#fff',
                p: 1.5,
                pt: 1,
                border: '1px solid #222',
                mb: 2,
                '@media print': {
                    pageBreakInside: 'avoid',
                }
            }}
        >
            {/* Header */}
            <Grid container alignItems="center" sx={{ mb: 1, justifyContent: 'space-between' }}>
                <Grid size={2}>
                    <Box
                        sx={{
                            width: 56,
                            height: 56,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        {logoUrl ? (
                            <Box
                                component="img"
                                src={logoUrl}
                                alt="School Logo"
                                sx={{
                                    maxWidth: '100%',
                                    maxHeight: '100%',
                                    objectFit: 'contain',
                                    display: 'block',
                                }}
                            />
                        ) : (
                            <Box
                                sx={{
                                    width: 56,
                                    height: 56,
                                    bgcolor: '#4f46e5',
                                    borderRadius: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <SchoolIcon sx={{ fontSize: 32, color: 'white' }} />
                            </Box>
                        )}
                    </Box>
                </Grid>
                <Grid size={8}>
                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '100%',
                        }}
                    >
                        <Typography
                            sx={{
                                fontSize: 20,
                                fontWeight: 800,
                                lineHeight: 1,
                                textAlign: 'center',
                            }}
                        >
                            {schoolName}
                        </Typography>
                        {(tagline || address) && (
                            <Typography sx={{ fontSize: 12, textAlign: 'center' }}>
                                {tagline || address}
                            </Typography>
                        )}
                        {tagline && address && (
                            <Typography sx={{ fontSize: 12, textAlign: 'center' }}>
                                {address}
                            </Typography>
                        )}
                    </Box>
                </Grid>
                <Grid size={2}>
                    <Box
                        sx={{
                            fontSize: 12,
                            textAlign: 'right',
                            lineHeight: 1.15,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                        }}
                    >
                        {phone && <div>Mob.: {phone}</div>}
                        {phone2 && <div>{phone2}</div>}
                        {phone3 && <div>{phone3}</div>}
                    </Box>
                </Grid>
            </Grid>

            <Divider sx={{ borderColor: '#222', borderBottomWidth: 2, mb: 0.5 }} />

            {/* Row 1: Name */}
            <Box
                sx={{
                    borderBottom: '2px solid #222',
                    minHeight: 28,
                    pb: 0.25,
                    mb: 0.5,
                    display: 'flex',
                    alignItems: 'center',
                }}
            >
                <Field label="Name">
                    <Underline width="100%">{data.studentName || ''}</Underline>
                </Field>
            </Box>

            {/* Row 2: Class / Shift / Receipt No */}
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    borderBottom: '2px solid #222',
                    minHeight: 32,
                    pb: 0.5,
                    mb: 0.5,
                    flexWrap: 'nowrap',
                }}
            >
                <Box sx={{ width: COL1_W, flex: '0 0 auto', pr: 1 }}>
                    <Field label="Class">
                        <Underline width="100%">{data.className || ''}</Underline>
                    </Field>
                </Box>
                <Box sx={{ width: COL2_W, flex: '0 0 auto', pr: 1 }}>
                    <Field
                        label="Shift"
                        labelTextW={MID_LABEL_TEXT_W}
                        colonW={MID_COL_W}
                        valuePad={MID_VALUE_PAD}
                    >
                        <Underline width="100%">{data.shift || ''}</Underline>
                    </Field>
                </Box>
                <Box sx={{ width: COL3_W, flex: '0 0 auto' }}>
                    <Field label="Rcpt. No.">
                        <Underline width="100%" align="left">
                            {normalizeReceipt(data.receiptNumber)}
                        </Underline>
                    </Field>
                </Box>
            </Box>

            {/* Row 3: Cash / Date */}
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    borderBottom: '2px solid #222',
                    minHeight: 32,
                    pb: 0.5,
                    mb: 0.5,
                    flexWrap: 'nowrap',
                }}
            >
                <Box sx={{ width: COL1_W, flex: '0 0 auto', pr: 1 }}>
                    <Field label="Cash ₹">
                        <Underline width="100%">{isCash ? `₹${data.amount || 0}` : ''}</Underline>
                    </Field>
                </Box>
                <Box sx={{ width: COL2_W, flex: '0 0 auto', pr: 1 }}>
                    <Field
                        label="Date"
                        labelTextW={MID_LABEL_TEXT_W}
                        colonW={MID_COL_W}
                        valuePad={MID_VALUE_PAD}
                    >
                        <Underline width="100%">{formatDate(data.date)}</Underline>
                    </Field>
                </Box>
                <Box sx={{ width: COL3_W, flex: '0 0 auto' }} />
            </Box>

            {/* Row 4: Cheque No / Bank OR UPI ID */}
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    borderBottom: '2px solid #222',
                    minHeight: 32,
                    pb: 0.5,
                    mb: 0.5,
                    flexWrap: 'nowrap',
                }}
            >
                <Box sx={{ width: COL1_W, flex: '0 0 auto', pr: 1 }}>
                    <Field label={isUPI ? "UPI ID" : "Cheque No."}>
                        <Underline width="100%">{isUPI ? (data.upiId || '') : (data.chequeNumber || '')}</Underline>
                    </Field>
                </Box>
                <Box sx={{ width: COL2_W, flex: '0 0 auto', pr: 1 }}>
                    <Field
                        label={isUPI ? "UPI Ref" : "Bank"}
                        labelTextW={MID_LABEL_TEXT_W}
                        colonW={MID_COL_W}
                        valuePad={MID_VALUE_PAD}
                    >
                        <Underline width="100%">{isUPI ? (data.upiReference || '') : (data.bankName || '')}</Underline>
                    </Field>
                </Box>
                <Box sx={{ width: COL3_W, flex: '0 0 auto' }} />
            </Box>

            {/* Row 5: Cheque/UPI Amount / Months / Sign */}
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    borderBottom: '2px solid #222',
                    minHeight: 32,
                    pb: 0.5,
                    flexWrap: 'nowrap',
                }}
            >
                <Box sx={{ width: COL1_W, flex: '0 0 auto', pr: 1 }}>
                    <Field label={isUPI ? "UPI ₹" : "Cheque ₹"}>
                        <Underline width="100%">{!isCash ? `₹${data.amount || 0}` : ''}</Underline>
                    </Field>
                </Box>
                <Box sx={{ width: COL2_W, flex: '0 0 auto', pr: 1 }}>
                    <Field
                        label="Months"
                        labelTextW={MID_LABEL_TEXT_W}
                        colonW={MID_COL_W}
                        valuePad={MID_VALUE_PAD}
                    >
                        <Underline width="100%">{displayUptoMonth(data.monthYear)}</Underline>
                    </Field>
                </Box>
                <Box sx={{ width: COL3_W, flex: '0 0 auto' }}>
                    <Field label="Sign.">
                        <Underline width="100%"></Underline>
                    </Field>
                </Box>
            </Box>
        </Box>
    );
};

export default function ReceiptModal({ open, onClose, transaction, student, settings }) {
    const receiptData = useMemo(() => {
        if (!transaction || !student) return null;
        return {
            studentName: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
            className: student.className || '',
            shift: student.shift || '',
            branchName: student.branchName || '',
            receiptNumber: transaction.receiptNumber,
            amount: transaction.amount,
            date: transaction.date,
            paymentMode: transaction.paymentMode,
            chequeNumber: transaction.chequeNumber || '',
            bankName: transaction.bankName || '',
            upiId: transaction.upiId || '',
            upiReference: transaction.upiReference || '',
            monthYear: transaction.monthYear || '',
        };
    }, [transaction, student]);

    if (!receiptData) return null;

    const handlePrint = () => {
        window.print();
    };

    return (
        <>
            <GlobalStyles
                styles={`
                    @media print {
                        body * { visibility: hidden; }
                        #receipt-print-area, #receipt-print-area * { visibility: visible; }
                        #receipt-print-area {
                            position: absolute;
                            left: 0;
                            top: 0;
                            width: 100%;
                        }
                        .print-hide { display: none !important; }
                        .receipt-copy-2 { display: block !important; }
                    }
                    @media screen {
                        .receipt-copy-2 { display: none; }
                    }
                    @page { size: A4; margin: 10mm; }
                `}
            />

            <Dialog
                open={open}
                onClose={onClose}
                maxWidth="md"
                fullWidth
                PaperProps={{
                    sx: { maxHeight: '90vh' }
                }}
            >
                <DialogContent sx={{ p: 3 }}>
                    <Box id="receipt-print-area">
                        {/* Copy 1 - Always visible */}
                        <ReceiptCopy data={receiptData} settings={settings} />

                        {/* Copy 2 - Only visible when printing */}
                        <Box className="receipt-copy-2">
                            <ReceiptCopy data={receiptData} settings={settings} />
                        </Box>
                    </Box>
                </DialogContent>

                <DialogActions className="print-hide" sx={{ p: 2, borderTop: '1px solid #e2e8f0' }}>
                    <Button onClick={onClose} startIcon={<CloseIcon />}>
                        Close
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<PrintIcon />}
                        onClick={handlePrint}
                        sx={{
                            bgcolor: '#4f46e5',
                            '&:hover': { bgcolor: '#4338ca' },
                        }}
                    >
                        Print Receipt
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
