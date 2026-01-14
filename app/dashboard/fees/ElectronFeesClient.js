'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Box,
    Typography,
    Paper,
    Button,
    TextField,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Grid,
    MenuItem,
    Alert,
    IconButton,
    Tooltip,
    Chip,
} from '@mui/material';
import {
    Add as AddIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
    Print as PrintIcon,
    ReceiptLong as ReceiptLongIcon,
    Person as PersonIcon,
    CurrencyRupee as CurrencyRupeeIcon,
    CalendarToday as CalendarTodayIcon,
    Money as MoneyIcon,
    AccountBalance as AccountBalanceIcon,
} from '@mui/icons-material';
import {
    DataGrid,
    GridToolbarContainer,
    GridToolbarColumnsButton,
    GridToolbarFilterButton,
    GridToolbarDensitySelector,
    GridToolbarExport,
} from '@mui/x-data-grid';
import { teal } from '@mui/material/colors';
import ReceiptModal from '@/components/ReceiptModal';
import MonthlyFeeTracker from '@/components/MonthlyFeeTracker';
import FeeReportModal from './FeeReportModal';
import { addFeePayment, deleteFeePayment, getFeePayments, getStudentTermSummary, previewNextReceiptNumber, updateFeePayment } from '@/app/actions/feeRecord';
import { getSettings } from '@/app/actions/settings';
import { getUiSetting, setUiSetting } from '@/app/actions/uiSettings';

const DEFAULT_COLUMN_VISIBILITY = {
    receipt_number: true,
    student_name: true,
    roll_number: true,
    class_name: true,
    amount: true,
    payment_type: true,
    payee_name: true,
    payment_date: true,
    month_year: false,
    fee_term: false,
    notes: false,
};

function normalizeFeesColumnsModel(model) {
    if (!model || typeof model !== 'object') return null;
    const map = {
        receiptNumber: 'receipt_number',
        studentName: 'student_name',
        rollNumber: 'roll_number',
        className: 'class_name',
        paymentType: 'payment_type',
        payeeName: 'payee_name',
        paymentDate: 'payment_date',
        monthYear: 'month_year',
        feeTerm: 'fee_term',
    };
    const out = { ...model };
    for (const [oldKey, newKey] of Object.entries(map)) {
        if (Object.prototype.hasOwnProperty.call(out, oldKey) && !Object.prototype.hasOwnProperty.call(out, newKey)) {
            out[newKey] = out[oldKey];
        }
    }
    return out;
}

function normalizeReceipt(raw) {
    if (!raw) return '';
    const s = String(raw);
    if (/^[cb]\d+$/i.test(s)) return `${s[0].toUpperCase()}-${s.slice(1)}`;
    return s;
}

function monthsBetween(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

    const months = [];
    const d = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    while (d <= last) {
        const monthName = d.toLocaleString('en-IN', { month: 'long' });
        months.push(monthName);
        d.setMonth(d.getMonth() + 1);
    }
    return months;
}

function todayDateOnly() {
    return new Date().toISOString().split('T')[0];
}

export default function ElectronFeesClient({
    academicYear,
    academicYearId,
    branchId,
    initialPayments = [],
    students = [],
    classEntries = [],
    branchName = '',
    yearName = '',
}) {
    const router = useRouter();
    const [message, setMessage] = useState(null);
    const [query, setQuery] = useState('');

    const [payments, setPayments] = useState(initialPayments);
    const [loading, setLoading] = useState(false);

    const [settings, setSettings] = useState(null);

    // Auto-refresh when branch or year changes (context switch)
    useEffect(() => {
        setPayments(initialPayments);
    }, [initialPayments]);

    // Refetch payments when branch/year context changes
    useEffect(() => {
        const refetchPayments = async () => {
            if (!academicYearId || !branchId) return;
            try {
                setLoading(true);
                const freshPayments = await getFeePayments({ academicYearId, branchId, search: query });
                setPayments(freshPayments);
            } catch (error) {
                console.error('Failed to refetch payments:', error);
            } finally {
                setLoading(false);
            }
        };
        refetchPayments();
    }, [academicYearId, branchId]);

    const [addOpen, setAddOpen] = useState(false);
    const [editRow, setEditRow] = useState(null);
    const [deleteRow, setDeleteRow] = useState(null);

    const [receiptRow, setReceiptRow] = useState(null);
    const [feeReportOpen, setFeeReportOpen] = useState(false);

    const [columnVisibility, setColumnVisibility] = useState(DEFAULT_COLUMN_VISIBILITY);
    const persistTimerRef = useRef(null);
    const lastQueuedVisibilityRef = useRef(JSON.stringify(DEFAULT_COLUMN_VISIBILITY));
    const lastSavedVisibilityRef = useRef(JSON.stringify(DEFAULT_COLUMN_VISIBILITY));

    const monthOptions = useMemo(() => {
        if (!academicYear?.startDate || !academicYear?.endDate) return [];
        return monthsBetween(academicYear.startDate, academicYear.endDate);
    }, [academicYear?.startDate, academicYear?.endDate]);

    const filtered = useMemo(() => {
        const q = String(query || '').trim().toLowerCase();
        if (!q) return payments;
        return (payments || []).filter((p) => (
            String(p.receiptNumber).toLowerCase().includes(q) ||
            String(p.studentName).toLowerCase().includes(q) ||
            String(p.rollNumber).toLowerCase().includes(q) ||
            String(p.className).toLowerCase().includes(q)
        ));
    }, [payments, query]);

    const refresh = async () => {
        setLoading(true);
        try {
            const rows = await getFeePayments({ academicYearId, branchId });
            setPayments(rows);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Load settings for receipts (logo/address/phones).
        (async () => {
            try {
                const s = await getSettings();
                setSettings(s);
            } catch {
                setSettings(null);
            }
        })();
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const saved = await getUiSetting('feesTableSettings');
                const model = normalizeFeesColumnsModel(saved?.columnVisibilityModel);
                if (model && typeof model === 'object') {
                    setColumnVisibility((prev) => {
                        const next = { ...prev, ...model };
                        const json = JSON.stringify(next);
                        lastQueuedVisibilityRef.current = json;
                        lastSavedVisibilityRef.current = json;
                        return next;
                    });
                }
            } catch {
                // ignore
            }
        })();
    }, []);

    const queuePersistColumns = (next) => {
        setColumnVisibility(next);
        const json = JSON.stringify(next);
        lastQueuedVisibilityRef.current = json;

        if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        persistTimerRef.current = setTimeout(async () => {
            if (lastSavedVisibilityRef.current === json) return;
            if (lastQueuedVisibilityRef.current !== json) return;
            try {
                await setUiSetting('feesTableSettings', { columnVisibilityModel: next }, 'general');
                lastSavedVisibilityRef.current = json;
            } catch {
                // ignore persistence failures (UI should still work)
            }
        }, 600);
    };

    useEffect(() => {
        return () => {
            if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        };
    }, []);

    const buildReportHtml = (rows) => {
        const escape = (v) =>
            String(v ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');

        const cols = [
            { key: 'receiptNumber', title: 'Receipt' },
            { key: 'studentName', title: 'Student Name' },
            { key: 'rollNumber', title: 'Roll No' },
            { key: 'classDisplay', title: 'Class' },
            { key: 'amount', title: 'Amount' },
            { key: 'paymentType', title: 'Type' },
            { key: 'paymentDate', title: 'Payment Date' },
            { key: 'monthYear', title: 'Upto Month' },
        ];

        const htmlRows = (rows || [])
            .map((r) => {
                const row = {
                    receiptNumber: normalizeReceipt(r.receiptNumber),
                    studentName: r.studentName || '',
                    rollNumber: r.rollNumber || '',
                    classDisplay: `${r.className || ''}${r.section ? ` (${r.section})` : ''}${r.shiftName ? ` • ${r.shiftName}` : ''}`,
                    amount: `₹${Number(r.amount || 0).toLocaleString('en-IN')}`,
                    paymentType: r.paymentType || '',
                    paymentDate: r.paymentDate || '',
                    monthYear: r.monthYear || '',
                };
                return `<tr>${cols.map((c) => `<td>${escape(row[c.key])}</td>`).join('')}</tr>`;
            })
            .join('');

        const now = new Date().toLocaleString('en-IN');
        return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Fees Report</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 16px; }
    .header { margin-bottom: 12px; text-align: center; }
    .branch { margin: 0; font-size: 20px; font-weight: 700; }
    .subject { margin: 2px 0 0 0; font-size: 13px; color: #333; }
    .meta { margin: 4px 0 8px 0; font-size: 12px; color: #555; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #999; padding: 6px 8px; font-size: 12px; }
    th { background: #f0f0f0; text-align: left; }
    @media print { @page { size: A4; margin: 12mm; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="branch">${escape(settings?.schoolName || 'School')}</div>
    <div class="subject">Fees Report</div>
    <div class="meta">${escape(now)} • Total: ${rows?.length || 0}</div>
  </div>
  <table>
    <thead><tr>${cols.map((c) => `<th>${escape(c.title)}</th>`).join('')}</tr></thead>
    <tbody>${htmlRows}</tbody>
  </table>
</body>
</html>`;
    };

    const printReport = () => {
        const html = buildReportHtml(filtered);
        const w = window.open('', '_blank');
        if (!w) return;
        w.document.open();
        w.document.write(html);
        w.document.close();
        w.focus();
        w.print();
    };

    const columns = useMemo(() => {
        return [
            {
                field: 'receipt_number',
                headerName: 'Receipt No.',
                minWidth: 120,
                flex: 0.8,
                headerAlign: 'center',
                align: 'center',
                renderCell: (params) => (
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            height: '100%',
                            justifyContent: 'center',
                            width: '100%',
                        }}
                    >
                        <ReceiptLongIcon sx={{ mr: 1, color: teal[700], fontSize: 18 }} />
                        <Tooltip title={normalizeReceipt(params.row?.receiptNumber)}>
                            <span
                                style={{ cursor: 'pointer', color: teal[700], fontWeight: 600 }}
                                onClick={() => setReceiptRow(params.row)}
                            >
                                {normalizeReceipt(params.row?.receiptNumber)}
                            </span>
                        </Tooltip>
                    </Box>
                ),
                valueGetter: (_value, row) => normalizeReceipt(row?.receiptNumber),
            },
            {
                field: 'student_name',
                headerName: 'Student Name',
                flex: 1,
                minWidth: 150,
                headerAlign: 'center',
                align: 'left',
                valueGetter: (_value, row) => row?.studentName || '',
                renderCell: (params) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                        <PersonIcon sx={{ mr: 1, color: teal[700], fontSize: 18 }} />
                        <Tooltip title={params.value || ''}>
                            <span
                                style={{
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    maxWidth: '100%',
                                }}
                            >
                                {params.value || ''}
                            </span>
                        </Tooltip>
                    </Box>
                ),
            },
            {
                field: 'roll_number',
                headerName: 'Roll No.',
                flex: 0.6,
                minWidth: 90,
                headerAlign: 'center',
                align: 'center',
                valueGetter: (_value, row) => row?.rollNumber || '',
                renderCell: (params) => (
                    <Tooltip title={params.value || ''}>
                        <span>{params.value || ''}</span>
                    </Tooltip>
                ),
            },
            {
                field: 'class_name',
                headerName: 'Class',
                flex: 0.8,
                minWidth: 100,
                headerAlign: 'center',
                align: 'center',
                valueGetter: (_value, row) => `${row?.className || ''}`,
                renderCell: (params) => (
                    <Tooltip title={params.value || ''}>
                        <span>{params.value || ''}</span>
                    </Tooltip>
                ),
            },
            {
                field: 'amount',
                headerName: 'Amount',
                flex: 0.7,
                minWidth: 100,
                headerAlign: 'center',
                align: 'center',
                valueFormatter: (v) => `₹${Number(v?.value ?? v ?? 0).toLocaleString('en-IN')}`,
                renderCell: (params) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', justifyContent: 'center', width: '100%' }}>
                        <CurrencyRupeeIcon sx={{ mr: 1, color: teal[700], fontSize: 18 }} />
                        <Tooltip title={String(params.formattedValue || '')}>
                            <span style={{ fontWeight: 600 }}>{params.formattedValue || '₹0'}</span>
                        </Tooltip>
                    </Box>
                ),
            },
            {
                field: 'payment_type',
                headerName: 'Payment Type',
                flex: 0.8,
                minWidth: 120,
                headerAlign: 'center',
                align: 'center',
                valueGetter: (_value, row) => (row?.paymentType || '').toString().toLowerCase(),
                renderCell: (params) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', justifyContent: 'center', width: '100%' }}>
                        {params.value === 'cash' ? (
                            <MoneyIcon sx={{ mr: 1, fontSize: 18, color: teal[700] }} />
                        ) : (
                            <AccountBalanceIcon sx={{ mr: 1, fontSize: 18, color: teal[700] }} />
                        )}
                        <Tooltip title={(params.value || '').toString()}>
                            <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>
                                {(params.value || '').toString()}
                            </span>
                        </Tooltip>
                    </Box>
                ),
            },
            { field: 'payee_name', headerName: 'Payee Name', flex: 1, minWidth: 130, valueGetter: (_value, row) => row?.payeeName || '' },
            {
                field: 'payment_date',
                headerName: 'Payment Date',
                flex: 0.8,
                minWidth: 120,
                headerAlign: 'center',
                align: 'center',
                valueGetter: (_value, row) => row?.paymentDate || '',
                renderCell: (params) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', justifyContent: 'center', width: '100%' }}>
                        <CalendarTodayIcon sx={{ mr: 1, color: teal[700], fontSize: 18 }} />
                        <Tooltip title={params.value || ''}>
                            <span>{params.value || ''}</span>
                        </Tooltip>
                    </Box>
                ),
            },
            { field: 'month_year', headerName: 'Upto Month', flex: 0.8, minWidth: 120, valueGetter: (_value, row) => row?.monthYear || '' },
            { field: 'fee_term', headerName: 'Fee Term', flex: 0.8, minWidth: 120, valueGetter: (_value, row) => row?.feeTerm || '' },
            {
                field: 'notes',
                headerName: 'Notes',
                width: 220,
                renderCell: (params) => (
                    <Tooltip title={params.row?.notes || ''}>
                        <span>{params.row?.notes || '-'}</span>
                    </Tooltip>
                ),
            },
            {
                field: '__actions',
                headerName: 'Actions',
                width: 220,
                sortable: false,
                filterable: false,
                hideable: false,
                headerAlign: 'center',
                align: 'center',
                renderCell: (params) => (
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', height: '100%', justifyContent: 'center' }}>
                        <Button
                            variant="contained"
                            color="secondary"
                            size="small"
                            onClick={() => setReceiptRow(params.row)}
                        >
                            Receipt
                        </Button>
                        <Button
                            variant="contained"
                            color="primary"
                            size="small"
                            onClick={() => setEditRow(params.row)}
                        >
                            Edit
                        </Button>
                        <Button
                            variant="contained"
                            color="error"
                            size="small"
                            onClick={() => setDeleteRow(params.row)}
                        >
                            Delete
                        </Button>
                    </Box>
                ),
            },
        ];
    }, []);

    function GridToolbar() {
        const fileName = `fees-${branchName || 'branch'}-${yearName || ''}`.trim().replace(/\\s+/g, '-');
        return (
            <GridToolbarContainer sx={{ justifyContent: 'space-between', p: 1 }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <GridToolbarColumnsButton />
                    <GridToolbarFilterButton />
                    <GridToolbarDensitySelector />
                </Box>
                <GridToolbarExport
                    csvOptions={{ fileName, utf8WithBom: true }}
                    printOptions={{ disableToolbarButton: true }}
                    slotProps={{ button: { variant: 'outlined', size: 'small' } }}
                />
            </GridToolbarContainer>
        );
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 2 }}>
                <Box>
                    <Typography variant="h4" fontWeight="bold">Fees Collection</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Receipt / Payments{branchName ? ` • ${branchName}` : ''}{yearName ? ` • ${yearName}` : ''}
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="outlined" onClick={() => setFeeReportOpen(true)}>
                        Report
                    </Button>
                    <Button variant="outlined" startIcon={<PrintIcon />} onClick={printReport}>
                        Print Report
                    </Button>
                    <Button variant="outlined" onClick={refresh} disabled={loading}>
                        {loading ? 'Refreshing...' : 'Refresh'}
                    </Button>
                    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
                        Collect Fees
                    </Button>
                </Box>
            </Box>

            {message && (
                <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
                    {message.text}
                </Alert>
            )}

            <Paper sx={{ p: 2, mb: 2 }}>
                <TextField
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by receipt, name, roll no, class..."
                    label="Search"
                    fullWidth
                />
            </Paper>

            <Paper sx={{ p: 1 }}>
                <DataGrid
                    rows={filtered}
                    columns={columns}
                    getRowId={(row) => row.transactionId}
                    autoHeight
                    disableRowSelectionOnClick
                    loading={loading}
                    pageSizeOptions={[10]}
                    initialState={{
                        pagination: { paginationModel: { pageSize: 10, page: 0 } },
                    }}
                    columnVisibilityModel={columnVisibility}
                    onColumnVisibilityModelChange={(model) => {
                        queuePersistColumns(model);
                    }}
                    slots={{ toolbar: GridToolbar }}
                />
            </Paper>

            <PaymentDialog
                mode="add"
                open={addOpen}
                onClose={() => setAddOpen(false)}
                academicYearId={academicYearId}
                academicYear={academicYear}
                students={students}
                monthOptions={monthOptions}
                onDone={async (res) => {
                    if (res?.error) setMessage({ type: 'error', text: res.error });
                    else setMessage({ type: 'success', text: `Fees collected (Receipt: ${res.receiptNumber})` });
                    setAddOpen(false);
                    await refresh();
                    router.refresh();
                }}
            />

            <PaymentDialog
                mode="edit"
                open={!!editRow}
                onClose={() => setEditRow(null)}
                academicYearId={academicYearId}
                academicYear={academicYear}
                students={students}
                monthOptions={monthOptions}
                initial={editRow}
                onDone={async (res) => {
                    if (res?.error) setMessage({ type: 'error', text: res.error });
                    else setMessage({ type: 'success', text: 'Payment updated.' });
                    setEditRow(null);
                    await refresh();
                    router.refresh();
                }}
            />

            <Dialog open={!!deleteRow} onClose={() => setDeleteRow(null)}>
                <DialogTitle>Delete Payment</DialogTitle>
                <DialogContent dividers>
                    <Typography>
                        Delete receipt <strong>{normalizeReceipt(deleteRow?.receiptNumber)}</strong> for{' '}
                        <strong>{deleteRow?.studentName}</strong>?
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        This will recalculate totals and month-wise status.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteRow(null)}>Cancel</Button>
                    <Button
                        color="error"
                        variant="contained"
                        onClick={async () => {
                            const res = await deleteFeePayment(deleteRow.transactionId);
                            if (res?.error) setMessage({ type: 'error', text: res.error });
                            else setMessage({ type: 'success', text: 'Payment deleted.' });
                            setDeleteRow(null);
                            await refresh();
                            router.refresh();
                        }}
                    >
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Receipt modal */}
            <ReceiptModal
                open={!!receiptRow}
                onClose={() => setReceiptRow(null)}
                transaction={
                    receiptRow
                        ? {
                            receiptNumber: receiptRow.receiptNumber,
                            amount: receiptRow.amount,
                            date: receiptRow.paymentDate,
                            paymentMode: receiptRow.paymentType === 'cash' ? 'Cash' : receiptRow.paymentType === 'upi' ? 'UPI' : 'Bank Transfer',
                            chequeNumber: receiptRow.chequeNumber,
                            bankName: receiptRow.bankName,
                            upiId: receiptRow.upiId,
                            upiReference: receiptRow.upiReference,
                            monthYear: receiptRow.monthYear,
                        }
                        : null
                }
                student={
                    receiptRow
                        ? {
                            firstName: receiptRow.studentName,
                            lastName: '',
                            className: receiptRow.className,
                            shift: receiptRow.shiftName,
                            branchName: receiptRow.branchName,
                        }
                        : null
                }
                settings={settings}
            />

            <FeeReportModal
                open={feeReportOpen}
                onClose={() => setFeeReportOpen(false)}
                academicYearId={academicYearId}
                branchId={branchId}
                yearName={yearName}
                branchName={branchName}
                classEntries={classEntries}
            />
        </Box>
    );
}

function PaymentDialog({ mode, open, onClose, academicYearId, academicYear, students, monthOptions, initial, onDone }) {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const [paymentType, setPaymentType] = useState(initial?.paymentType || 'cash');
    const [receiptPreview, setReceiptPreview] = useState('');
    const [selectedStudentId, setSelectedStudentId] = useState(initial?.studentId || '');
    const [feeTerm, setFeeTerm] = useState(initial?.feeTerm || 'term1');
    const [feeTermTouched, setFeeTermTouched] = useState(false);
    const [termSummary, setTermSummary] = useState(null);
    const [termLoading, setTermLoading] = useState(false);

    useEffect(() => {
        if (!open) return;
        setError('');
        setSubmitting(false);
        setPaymentType(initial?.paymentType || 'cash');
        setSelectedStudentId(initial?.studentId || '');
        setFeeTerm(initial?.feeTerm || 'term1');
        setFeeTermTouched(false);
        setTermSummary(null);
        setTermLoading(false);
    }, [open, initial?.transactionId, initial?.paymentType, initial?.studentId, initial?.feeTerm]);

    useEffect(() => {
        const run = async () => {
            if (!open) return;
            if (!selectedStudentId || mode === 'edit') return;
            setTermLoading(true);
            try {
                const res = await getStudentTermSummary(selectedStudentId, academicYearId);
                if (res?.success) {
                    setTermSummary(res.summary);
                    // Electron-like default: pick first pending term when collecting fees.
                    const terms = res.summary?.terms || {};
                    const priority = ['term1', 'term2', 'books'];
                    const pendingKey = priority.find((k) => (Number(terms?.[k]?.pending) || 0) > 0) || 'term1';
                    if (!feeTermTouched) setFeeTerm(pendingKey);
                } else {
                    setTermSummary(null);
                }
            } catch {
                setTermSummary(null);
            } finally {
                setTermLoading(false);
            }
        };
        run();
    }, [open, selectedStudentId, academicYearId, mode, feeTermTouched]);

    useEffect(() => {
        if (!open) return;
        (async () => {
            try {
                const next = await previewNextReceiptNumber(paymentType);
                setReceiptPreview(next);
            } catch {
                setReceiptPreview('');
            }
        })();
    }, [open, paymentType]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');

        const formData = new FormData(e.currentTarget);
        formData.set('academicYearId', academicYearId);
        formData.set('paymentType', paymentType);
        if (feeTerm) formData.set('feeTerm', feeTerm);

        try {
            const res =
                mode === 'edit'
                    ? await updateFeePayment(initial.transactionId, formData)
                    : await addFeePayment(formData);
            if (res?.error) {
                setError(res.error);
                onDone?.(res);
                return;
            }
            onDone?.(res);
        } catch (err) {
            const msg = err?.message || 'Payment failed';
            setError(msg);
            onDone?.({ error: msg });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>{mode === 'edit' ? 'Edit Fees Payment' : 'Collect Fees'}</DialogTitle>
            <Box component="form" onSubmit={handleSubmit}>
                <DialogContent dividers>
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                    <Grid container spacing={2}>
                        <Grid item xs={12} md={6}>
                            <TextField
                                select
                                name="studentId"
                                label="Student"
                                fullWidth
                                required
                                disabled={mode === 'edit'}
                                value={selectedStudentId}
                                onChange={(e) => setSelectedStudentId(e.target.value)}
                            >
                                <MenuItem value="">Select Student</MenuItem>
                                {(students || []).map((s) => (
                                    <MenuItem key={s._id} value={s._id}>
                                        {s.name} ({s.rollNumber}) ({s.className}{s.section ? `-${s.section}` : ''})
                                    </MenuItem>
                                ))}
                            </TextField>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                label="Receipt No. (Preview)"
                                value={mode === 'edit' ? normalizeReceipt(initial?.receiptNumber) : receiptPreview}
                                fullWidth
                                disabled
                            />
                        </Grid>

                        <Grid item xs={12} sm={4}>
                            <TextField
                                name="amount"
                                label="Amount"
                                type="number"
                                inputProps={{ min: 0, step: 1 }}
                                fullWidth
                                required
                                defaultValue={initial?.amount || ''}
                            />
                        </Grid>

                        <Grid item xs={12} sm={4}>
                            <TextField
                                select
                                label="Payment Type"
                                fullWidth
                                value={paymentType}
                                onChange={(e) => setPaymentType(e.target.value)}
                            >
                                <MenuItem value="cash">cash</MenuItem>
                                <MenuItem value="bank">bank</MenuItem>
                                <MenuItem value="upi">upi</MenuItem>
                            </TextField>
                        </Grid>

                        <Grid item xs={12} sm={4}>
                            <TextField
                                name="paymentDate"
                                label="Payment Date"
                                type="date"
                                fullWidth
                                required
                                defaultValue={initial?.paymentDate || todayDateOnly()}
                                slotProps={{ inputLabel: { shrink: true } }}
                            />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <TextField
                                select
                                name="monthYear"
                                label="Upto Month"
                                fullWidth
                                required
                                defaultValue={initial?.monthYear || ''}
                            >
                                <MenuItem value="">Select Month</MenuItem>
                                {monthOptions.map((m) => (
                                    <MenuItem key={m} value={m}>{m}</MenuItem>
                                ))}
                            </TextField>
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <TextField
                                select
                                label="Fee Term"
                                fullWidth
                                value={feeTerm}
                                onChange={(e) => {
                                    setFeeTermTouched(true);
                                    setFeeTerm(e.target.value);
                                }}
                            >
                                <MenuItem value="term1">term1</MenuItem>
                                <MenuItem value="term2">term2</MenuItem>
                                <MenuItem value="books">books</MenuItem>
                            </TextField>
                        </Grid>

                        {paymentType === 'bank' && (
                            <>
                                <Grid item xs={12} sm={6}>
                                    <TextField name="payeeName" label="Payee Name" fullWidth required defaultValue={initial?.payeeName || ''} />
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <TextField name="bankName" label="Bank Name" fullWidth defaultValue={initial?.bankName || ''} />
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <TextField name="chequeNumber" label="Cheque Number" fullWidth defaultValue={initial?.chequeNumber || ''} />
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <TextField
                                        name="chequeDate"
                                        label="Cheque Date"
                                        type="date"
                                        fullWidth
                                        defaultValue={initial?.chequeDate || ''}
                                        slotProps={{ inputLabel: { shrink: true } }}
                                    />
                                </Grid>
                            </>
                        )}

                        {paymentType === 'upi' && (
                            <>
                                <Grid item xs={12} sm={6}>
                                    <TextField
                                        name="upiId"
                                        label="UPI ID / VPA"
                                        fullWidth
                                        placeholder="user@paytm, user@gpay, etc."
                                        defaultValue={initial?.upiId || ''}
                                    />
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <TextField
                                        name="upiReference"
                                        label="UPI Transaction ID"
                                        fullWidth
                                        placeholder="Transaction reference number"
                                        defaultValue={initial?.upiReference || ''}
                                    />
                                </Grid>
                                <Grid item xs={12}>
                                    <TextField name="payeeName" label="Payee Name" fullWidth defaultValue={initial?.payeeName || ''} />
                                </Grid>
                            </>
                        )}

                        <Grid item xs={12}>
                            <TextField name="notes" label="Notes" fullWidth defaultValue={initial?.notes || ''} />
                        </Grid>

                        {mode !== 'edit' && (
                            <Grid item xs={12}>
                                <Paper variant="outlined" sx={{ p: 2 }}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                                        Student Fee Summary
                                    </Typography>
                                    {!selectedStudentId ? (
                                        <Typography variant="body2" color="text.secondary">
                                            Select a student to view term summary and monthly status.
                                        </Typography>
                                    ) : termLoading ? (
                                        <Typography variant="body2" color="text.secondary">
                                            Loading summary...
                                        </Typography>
                                    ) : termSummary ? (
                                        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                            {['term1', 'term2', 'books'].map((k) => {
                                                const t = termSummary?.terms?.[k] || {};
                                                const pending = Number(t.pending) || 0;
                                                return (
                                                    <Chip
                                                        key={k}
                                                        label={`${k}: Pending ₹${pending.toLocaleString('en-IN')}`}
                                                        color={pending > 0 ? 'warning' : 'success'}
                                                        variant="outlined"
                                                    />
                                                );
                                            })}
                                        </Box>
                                    ) : (
                                        <Typography variant="body2" color="text.secondary">
                                            No fee record found for this student.
                                        </Typography>
                                    )}
                                </Paper>
                            </Grid>
                        )}

                        {mode !== 'edit' && selectedStudentId && (
                            <Grid item xs={12}>
                                <MonthlyFeeTracker studentId={selectedStudentId} academicYearId={academicYearId} />
                            </Grid>
                        )}
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose} disabled={submitting}>Cancel</Button>
                    <Button type="submit" variant="contained" disabled={submitting}>
                        {submitting ? 'Saving...' : mode === 'edit' ? 'Save' : 'Collect'}
                    </Button>
                </DialogActions>
            </Box>
        </Dialog>
    );
}
