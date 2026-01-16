'use client';

import { useEffect, useMemo, useRef, useState, useCallback, FormEvent, ChangeEvent } from 'react';
import {
    Box,
    Typography,
    Paper,
    Button,
    TextField,
    CircularProgress,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Grid,
    Alert,
    IconButton,
    Tooltip,
    Chip,
    Skeleton,
} from '@mui/material';
import {
    Add as AddIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
    Print as PrintIcon,
    AssessmentOutlined as ReportIcon,
    Refresh as RefreshIcon,
    ReceiptLong as ReceiptLongIcon,
    Person as PersonIcon,
    CurrencyRupee as CurrencyRupeeIcon,
    CalendarToday as CalendarTodayIcon,
    Money as MoneyIcon,
    AccountBalance as AccountBalanceIcon,
} from '@mui/icons-material';
import {
    GridToolbarContainer,
    GridToolbarColumnsButton,
    GridToolbarFilterButton,
    GridToolbarDensitySelector,
    GridToolbarExport,
    GridColDef,
    GridRenderCellParams,
    GridColumnVisibilityModel,
    useGridApiRef,
} from '@mui/x-data-grid';
import { teal } from '@mui/material/colors';
import ReceiptModal from '@/components/ReceiptModal';
import MonthlyFeeTracker from '@/components/MonthlyFeeTracker';
import AsyncSearchableSelect from '@/components/ui/AsyncSearchableSelect';
import SearchableSelect, { type SearchableSelectOption } from '@/components/ui/SearchableSelect';
import useServerPaginatedGrid from '@/components/ui/grid/useServerPaginatedGrid';
import ExportAllCsvButton from '@/components/ui/grid/ExportAllCsvButton';
import FeeReportModal from './FeeReportModal';
import StandardDataGrid from '@/components/StandardDataGrid';
import { addFeePayment, deleteFeePayment, getFeePaymentsPage, getStudentTermSummary, previewNextReceiptNumber, updateFeePayment } from '@/app/actions/feeRecord';
import { getSettings } from '@/app/actions/settings';
import { getUiSetting, setUiSetting } from '@/app/actions/uiSettings';
import { feeTermLabel, FEE_TERM_OPTIONS } from '@/lib/feeTerms';
import { paymentTypeLabel, PAYMENT_TYPE_OPTIONS } from '@/lib/paymentTypes';

interface AcademicYear {
    _id: string;
    name: string;
    startDate?: string;
    endDate?: string;
}

interface ClassEntry {
    _id: string;
    class: string;
    shiftName?: string;
}

interface PaymentRow {
    transactionId: string;
    receiptNumber?: string;
    studentId?: string;
    studentName?: string;
    rollNumber?: string;
    className?: string;
    division?: string;
    shiftName?: string;
    branchName?: string;
    amount?: number;
    paymentType?: string;
    paymentDate?: string;
    monthYear?: string;
    feeTerm?: string;
    payeeName?: string;
    bankName?: string;
    chequeNumber?: string;
    chequeDate?: string;
    upiId?: string;
    upiReference?: string;
    notes?: string;
}

interface Settings {
    schoolName?: string;
    schoolTagline?: string;
    address?: string;
    phone?: string;
    phone2?: string;
    phone3?: string;
    logoUrl?: string;
}

interface Message {
    type: 'success' | 'error' | 'info' | 'warning';
    text: string;
}

interface TermSummary {
    terms?: {
        term1?: { pending?: number };
        term2?: { pending?: number };
        books?: { pending?: number };
    };
}

interface FeesClientProps {
    academicYear?: AcademicYear | null;
    academicYearId: string;
    branchId: string;
    initialPayments?: PaymentRow[];
    initialPaymentRowCount?: number;
    classEntries?: ClassEntry[];
    branchName?: string;
    yearName?: string;
}

const DEFAULT_COLUMN_VISIBILITY: GridColumnVisibilityModel = {
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

function normalizeFeesColumnsModel(model: unknown): GridColumnVisibilityModel | null {
    if (!model || typeof model !== 'object') return null;
    const map: Record<string, string> = {
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
    const out = { ...(model as Record<string, boolean>) };
    for (const [oldKey, newKey] of Object.entries(map)) {
        if (Object.prototype.hasOwnProperty.call(out, oldKey) && !Object.prototype.hasOwnProperty.call(out, newKey)) {
            out[newKey] = out[oldKey];
        }
    }
    return out;
}

function normalizeReceipt(raw: unknown): string {
    if (!raw) return '';
    const s = String(raw);
    if (/^[cb]\d+$/i.test(s)) return `${s[0].toUpperCase()}-${s.slice(1)}`;
    return s;
}

function monthsBetween(startDate: string | undefined, endDate: string | undefined): string[] {
    if (!startDate || !endDate) return [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

    const months: string[] = [];
    const d = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    while (d <= last) {
        const monthName = d.toLocaleString('en-IN', { month: 'long' });
        months.push(monthName);
        d.setMonth(d.getMonth() + 1);
    }
    return months;
}

function todayDateOnly(): string {
    return new Date().toISOString().split('T')[0];
}

export default function FeesClient({
    academicYear,
    academicYearId,
    branchId,
    initialPayments = [],
    initialPaymentRowCount = 0,
    classEntries = [],
    branchName = '',
    yearName = '',
}: FeesClientProps) {
	    const [message, setMessage] = useState<Message | null>(null);
	    const [query, setQuery] = useState('');
	    const apiRef = useGridApiRef();

	    const [settings, setSettings] = useState<Settings | null>(null);

	    const fetchPaymentsPage = useCallback(
	        async ({
	            page,
	            pageSize,
	            search,
	            sortModel,
	            filterModel,
	        }: {
	            page: number;
	            pageSize: number;
	            search: string;
	            sortModel: any;
	            filterModel: any;
	        }) => {
	            const res = await getFeePaymentsPage({ academicYearId, branchId, search, page, pageSize, sortModel, filterModel });
	            return {
	                rows: Array.isArray(res?.rows) ? res.rows : [],
	                total: Number(res?.total) || 0,
	            };
	        },
	        [academicYearId, branchId]
	    );

	    const {
	        rows: displayedPayments,
	        rowCount,
	        paginationModel,
	        setPaginationModel,
	        sortModel,
	        onSortModelChange,
	        filterModel,
	        onFilterModelChange,
	        loading: gridLoading,
	        searchActive,
	        effectiveSearch,
	        refresh: refreshRows,
	    } = useServerPaginatedGrid<PaymentRow>({
	        initialRows: initialPayments,
	        initialRowCount: initialPaymentRowCount,
	        initialPaginationModel: { page: 0, pageSize: 10 },
	        query,
	        minChars: 2,
	        debounceMs: 300,
	        fetchPage: fetchPaymentsPage,
	    });

    const [addOpen, setAddOpen] = useState(false);
    const [editRow, setEditRow] = useState<PaymentRow | null>(null);
    const [deleteRow, setDeleteRow] = useState<PaymentRow | null>(null);

    const [receiptRow, setReceiptRow] = useState<PaymentRow | null>(null);
    const [feeReportOpen, setFeeReportOpen] = useState(false);
    const [printLoading, setPrintLoading] = useState(false);

    const [columnVisibility, setColumnVisibility] = useState<GridColumnVisibilityModel>(DEFAULT_COLUMN_VISIBILITY);
    const persistTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastQueuedVisibilityRef = useRef(JSON.stringify(DEFAULT_COLUMN_VISIBILITY));
    const lastSavedVisibilityRef = useRef(JSON.stringify(DEFAULT_COLUMN_VISIBILITY));

    const academicYearStartDate = academicYear?.startDate;
    const academicYearEndDate = academicYear?.endDate;
    const monthOptions = useMemo(() => {
        if (!academicYearStartDate || !academicYearEndDate) return [];
        return monthsBetween(academicYearStartDate, academicYearEndDate);
    }, [academicYearStartDate, academicYearEndDate]);

    useEffect(() => {
        if (displayedPayments.length > 0) {
            const timeout = setTimeout(() => {
                apiRef.current.autosizeColumns({
                    includeHeaders: true,
                    columns: ['student_name', 'payee_name'],
                    includeOutliers: true,
                });
            }, 100);
            return () => clearTimeout(timeout);
        }
    }, [displayedPayments, apiRef]);

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
                const model = normalizeFeesColumnsModel((saved as { columnVisibilityModel?: unknown })?.columnVisibilityModel);
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

    const queuePersistColumns = (next: GridColumnVisibilityModel) => {
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

    const buildReportHtml = (rows: PaymentRow[]) => {
        const escape = (v: unknown) =>
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
                    classDisplay: `${r.className || ''}${r.division ? ` (${r.division})` : ''}${r.shiftName ? ` \u2022 ${r.shiftName}` : ''}`,
                    amount: `\u20B9${Number(r.amount || 0).toLocaleString('en-IN')}`,
                    paymentType: paymentTypeLabel(r.paymentType),
                    paymentDate: r.paymentDate || '',
                    monthYear: r.monthYear || '',
                };
                return `<tr>${cols.map((c) => `<td>${escape(row[c.key as keyof typeof row])}</td>`).join('')}</tr>`;
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
    <div class="meta">${escape(now)} \u2022 Total: ${rows?.length || 0}</div>
  </div>
  <table>
    <thead><tr>${cols.map((c) => `<th>${escape(c.title)}</th>`).join('')}</tr></thead>
    <tbody>${htmlRows}</tbody>
  </table>
</body>
</html>`;
    };

    const printReport = async () => {
        setPrintLoading(true);
        try {
            // Fetch all matching rows for printing (pagination-aware)
            const PAGE_SIZE = 200;
            const MAX_PRINT_ROWS = 5000;
            const all: PaymentRow[] = [];
            let page = 0;
            let total = 0;

            while (true) {
                const res = await getFeePaymentsPage({
                    academicYearId,
                    branchId,
                    search: effectiveSearch,
                    page,
                    pageSize: PAGE_SIZE,
                    sortModel,
                    filterModel,
                });

                if (page === 0) total = Number(res?.total) || 0;
                const rows = Array.isArray(res?.rows) ? (res.rows as PaymentRow[]) : [];
                all.push(...rows);

                if (all.length >= total) break;
                if (rows.length === 0) break;
                if (all.length >= MAX_PRINT_ROWS) break;
                page += 1;
            }

            const html = buildReportHtml(all);
            const w = window.open('', '_blank');
            if (!w) {
                setMessage({ type: 'error', text: 'Failed to open print window. Please allow popups.' });
                return;
            }
            w.document.open();
            w.document.write(html);
            w.document.close();
            w.focus();
            w.print();
        } catch (err) {
            setMessage({ type: 'error', text: 'Failed to load all data for printing.' });
        } finally {
            setPrintLoading(false);
        }
    };

    const columns: GridColDef[] = useMemo(() => {
        return [
            {
                field: 'receipt_number',
                headerName: 'Receipt No.',
                minWidth: 120,
                flex: 0.8,
                headerAlign: 'center',
                align: 'center',
                renderCell: (params: GridRenderCellParams) => (
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
                        <Tooltip title={normalizeReceipt((params.row as PaymentRow)?.receiptNumber)}>
                            <span
                                style={{ cursor: 'pointer', color: teal[700], fontWeight: 600 }}
                                onClick={() => setReceiptRow(params.row as PaymentRow)}
                            >
                                {normalizeReceipt((params.row as PaymentRow)?.receiptNumber)}
                            </span>
                        </Tooltip>
                    </Box>
                ),
                valueGetter: (_value, row) => normalizeReceipt(row?.receiptNumber),
            },
            {
                field: 'student_name',
                headerName: 'Student Name',
                headerAlign: 'center',
                align: 'left',
                valueGetter: (_value, row) => row?.studentName || '',
                renderCell: (params: GridRenderCellParams) => (
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
                renderCell: (params: GridRenderCellParams) => (
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
                renderCell: (params: GridRenderCellParams) => (
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
                valueFormatter: (v) => `\u20B9${Number((v as { value?: unknown })?.value ?? v ?? 0).toLocaleString('en-IN')}`,
                renderCell: (params: GridRenderCellParams) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', justifyContent: 'center', width: '100%' }}>
                        <CurrencyRupeeIcon sx={{ mr: 1, color: teal[700], fontSize: 18 }} />
                        <Tooltip title={String(params.formattedValue || '')}>
                            <span style={{ fontWeight: 600 }}>{params.formattedValue || '\u20B90'}</span>
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
                renderCell: (params: GridRenderCellParams) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', justifyContent: 'center', width: '100%' }}>
                        {params.value === 'cash' ? (
                            <MoneyIcon sx={{ mr: 1, fontSize: 18, color: teal[700] }} />
                        ) : (
                            <AccountBalanceIcon sx={{ mr: 1, fontSize: 18, color: teal[700] }} />
                        )}
                        <Tooltip title={paymentTypeLabel(params.value)}>
                            <span style={{ fontWeight: 600 }}>{paymentTypeLabel(params.value)}</span>
                        </Tooltip>
                    </Box>
                ),
            },
            { field: 'payee_name', headerName: 'Payee Name', valueGetter: (_value, row) => row?.payeeName || '' },
            {
                field: 'payment_date',
                headerName: 'Payment Date',
                flex: 0.8,
                minWidth: 120,
                headerAlign: 'center',
                align: 'center',
                valueGetter: (_value, row) => row?.paymentDate || '',
                renderCell: (params: GridRenderCellParams) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', justifyContent: 'center', width: '100%' }}>
                        <CalendarTodayIcon sx={{ mr: 1, color: teal[700], fontSize: 18 }} />
                        <Tooltip title={params.value || ''}>
                            <span>{params.value || ''}</span>
                        </Tooltip>
                    </Box>
                ),
            },
            { field: 'month_year', headerName: 'Upto Month', flex: 0.8, minWidth: 120, valueGetter: (_value, row) => row?.monthYear || '' },
            { field: 'fee_term', headerName: 'Fee Term', flex: 0.8, minWidth: 120, valueGetter: (_value, row) => feeTermLabel(row?.feeTerm) },
            {
                field: 'notes',
                headerName: 'Notes',
                width: 220,
                renderCell: (params: GridRenderCellParams) => (
                    <Tooltip title={(params.row as PaymentRow)?.notes || ''}>
                        <span>{(params.row as PaymentRow)?.notes || '-'}</span>
                    </Tooltip>
                ),
            },
            {
                field: '__actions',
                headerName: 'Actions',
                width: 160,
                sortable: false,
                filterable: false,
                hideable: false,
                headerAlign: 'center',
                align: 'center',
                renderCell: (params: GridRenderCellParams) => (
                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', height: '100%', justifyContent: 'center' }}>
                        <Tooltip title="Receipt">
                            <IconButton
                                size="small"
                                onClick={() => setReceiptRow(params.row as PaymentRow)}
                            >
                                <ReceiptLongIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit">
                            <IconButton
                                size="small"
                                onClick={() => setEditRow(params.row as PaymentRow)}
                            >
                                <EditIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                            <IconButton
                                size="small"
                                color="error"
                                onClick={() => setDeleteRow(params.row as PaymentRow)}
                            >
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                ),
            },
        ];
    }, []);

    function GridToolbar() {
        const fileName = `fees-${branchName || 'branch'}-${yearName || ''}`.trim().replace(/\s+/g, '-');
        return (
            <GridToolbarContainer
                sx={{
                    p: 1,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 1,
                    rowGap: 1,
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minWidth: 0,
                }}
            >
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', minWidth: 0 }}>
                    <GridToolbarColumnsButton />
                    <GridToolbarFilterButton />
                    <GridToolbarDensitySelector />
                    <ExportAllCsvButton
                        entity="fees"
                        filename={fileName}
                        disabled={gridLoading}
                        payload={{
                            academicYearId,
                            branchId,
                            search: effectiveSearch,
                            sortModel,
                            filterModel,
                        }}
                        onError={(msg) => setMessage({ type: 'error', text: msg })}
                    />
                </Box>
                <Box
                    sx={{
                        width: { xs: '100%', sm: 'auto' },
                        display: 'flex',
                        justifyContent: { xs: 'flex-start', sm: 'flex-end' },
                    }}
                >
                    <GridToolbarExport
                        csvOptions={{ fileName, utf8WithBom: true }}
                        printOptions={{ disableToolbarButton: true }}
                        slotProps={{ button: { size: 'small' } }}
                    />
                </Box>
            </GridToolbarContainer>
        );
    }

    return (
        <Box sx={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
            <Box sx={{
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'column', md: 'row' },
                justifyContent: 'space-between',
                alignItems: { xs: 'flex-start', md: 'flex-end' },
                gap: 2,
                mb: 2,
                minWidth: 0,
                width: '100%',
            }}>
                <Box sx={{ flex: 1, minWidth: 0, width: { xs: '100%', md: 'auto' } }}>
                    <Typography variant="h4" fontWeight="bold">Fees Collection</Typography>
                    <Typography
                        variant="body2"
                        color="text.secondary"
                        noWrap
                        sx={{ minWidth: 0, maxWidth: '100%' }}
                    >
                        Receipt / Payments{branchName ? ` \u2022 ${branchName}` : ''}{yearName ? ` \u2022 ${yearName}` : ''}
                    </Typography>
                </Box>
                <Box sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    gap: 1.5,
                    flexWrap: 'wrap',
                    minWidth: 0,
                    width: { xs: '100%', sm: 'auto' },
                    maxWidth: { md: '60%' },
                    alignItems: { xs: 'stretch', sm: 'center' },
                }}>
                    <Button
                        variant="outlined"
                        startIcon={<ReportIcon />}
                        onClick={() => setFeeReportOpen(true)}
                        sx={{
                            height: 40,
                            width: { xs: '100%', sm: 'auto' },
                            flexShrink: 0,
                            minWidth: { sm: 'max-content' },
                            whiteSpace: 'nowrap',
                            px: 3,
                        }}
                    >
                        Report
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={printLoading ? <CircularProgress size={18} /> : <PrintIcon />}
                        onClick={printReport}
                        disabled={printLoading}
                        sx={{
                            height: 40,
                            width: { xs: '100%', sm: 'auto' },
                            flexShrink: 0,
                            minWidth: { sm: 'max-content' },
                            whiteSpace: 'nowrap',
                            px: 2,
                        }}
                    >
                        {printLoading ? 'Loading…' : 'Print Report'}
                    </Button>
                    <Button
                        variant="outlined"
                        onClick={refreshRows}
                        disabled={gridLoading}
                        startIcon={gridLoading ? <CircularProgress size={18} /> : <RefreshIcon />}
                        sx={{
                            height: 40,
                            width: { xs: '100%', sm: 'auto' },
                            flexShrink: 0,
                            minWidth: { sm: 'max-content' },
                            whiteSpace: 'nowrap',
                            px: 2,
                        }}
                    >
                        Refresh
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => setAddOpen(true)}
                        sx={{
                            height: 40,
                            width: { xs: '100%', sm: 'auto' },
                            flexShrink: 0,
                            minWidth: { sm: 'max-content' },
                            whiteSpace: 'nowrap',
                            px: 3,
                        }}
                    >
                        Collect Fees
                    </Button>
                </Box>
            </Box>

            {message && (
                <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
                    {message.text}
                </Alert>
            )}

	            <Paper sx={{ p: { xs: 1.5, sm: 2 }, mb: 2, width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
	                <TextField
	                    id="fees-search"
	                    value={query}
	                    onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
	                    placeholder="Search by receipt, name, roll no, class (min 2 chars)..."
	                    label="Search"
	                    size="small"
	                    sx={{ width: '100%', maxWidth: '100%' }}
	                    slotProps={{
	                        input: {
	                            endAdornment: gridLoading && searchActive ? <CircularProgress size={18} /> : undefined,
	                        },
	                    }}
	                />
	            </Paper>

            <StandardDataGrid
                apiRef={apiRef}
                rows={displayedPayments}
                columns={columns}
                getRowId={(row) => row.transactionId}
                autoHeight
                loading={gridLoading}
                paginationMode="server"
                sortingMode="server"
                sortModel={sortModel}
                onSortModelChange={onSortModelChange}
                filterMode="server"
                filterModel={filterModel}
                onFilterModelChange={onFilterModelChange}
                rowCount={rowCount}
                paginationModel={paginationModel}
                onPaginationModelChange={setPaginationModel}
                pageSizeOptions={[10, 25, 50]}
                initialState={{ sorting: { sortModel: [{ field: 'receipt_number', sort: 'desc' }] } }}
                columnVisibilityModel={columnVisibility}
                onColumnVisibilityModelChange={(model) => {
                    queuePersistColumns(model);
                }}
                slots={{ toolbar: GridToolbar }}
            />

            <PaymentDialog
                mode="add"
                open={addOpen}
                onClose={() => setAddOpen(false)}
                academicYearId={academicYearId}
                branchId={branchId}
                academicYear={academicYear}
                monthOptions={monthOptions}
                onDone={async (res) => {
                    if (res?.error) setMessage({ type: 'error', text: res.error });
                    else setMessage({ type: 'success', text: `Fees collected (Receipt: ${res.receiptNumber})` });
                    setAddOpen(false);
                    refreshRows();
                }}
            />

            <PaymentDialog
                mode="edit"
                open={!!editRow}
                onClose={() => setEditRow(null)}
                academicYearId={academicYearId}
                branchId={branchId}
                academicYear={academicYear}
                monthOptions={monthOptions}
                initial={editRow}
                onDone={async (res) => {
                    if (res?.error) setMessage({ type: 'error', text: res.error });
                    else setMessage({ type: 'success', text: 'Payment updated.' });
                    setEditRow(null);
                    refreshRows();
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
                            const res = await deleteFeePayment(deleteRow!.transactionId);
                            if (res?.error) setMessage({ type: 'error', text: res.error });
                            else setMessage({ type: 'success', text: 'Payment deleted.' });
                            setDeleteRow(null);
                            refreshRows();
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
                            paymentMode:
                                receiptRow.paymentType === 'cash'
                                    ? 'Cash'
                                    : receiptRow.paymentType === 'upi'
                                        ? 'UPI'
                                        : (receiptRow.chequeNumber || receiptRow.chequeDate)
                                            ? 'Cheque'
                                            : 'Bank Transfer',
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
                            firstName: receiptRow.studentName || '',
                            lastName: '',
                            className: receiptRow.className || '',
                            shift: receiptRow.shiftName || '',
                            branchName: receiptRow.branchName || '',
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

interface PaymentDialogProps {
    mode: 'add' | 'edit';
    open: boolean;
    onClose: () => void;
    academicYearId: string;
    branchId: string;
    academicYear?: AcademicYear | null;
    monthOptions: string[];
    initial?: PaymentRow | null;
    onDone?: (res: { error?: string; receiptNumber?: string }) => void;
}

function PaymentDialog({ mode, open, onClose, academicYearId, branchId, academicYear, monthOptions, initial, onDone }: PaymentDialogProps) {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const [paymentType, setPaymentType] = useState(initial?.paymentType || 'cash');
    const [receiptPreview, setReceiptPreview] = useState('');
    const [selectedStudentId, setSelectedStudentId] = useState(initial?.studentId || '');
    const [monthYear, setMonthYear] = useState(initial?.monthYear || '');
    const [feeTerm, setFeeTerm] = useState(initial?.feeTerm || 'term1');
    const [feeTermTouched, setFeeTermTouched] = useState(false);
    const [termSummary, setTermSummary] = useState<TermSummary | null>(null);
    const [termLoading, setTermLoading] = useState(false);

    useEffect(() => {
        if (!open) return;
        setError('');
        setSubmitting(false);
        setPaymentType(initial?.paymentType || 'cash');
        setSelectedStudentId(initial?.studentId || '');
        setMonthYear(initial?.monthYear || '');
        setFeeTerm(initial?.feeTerm || 'term1');
        setFeeTermTouched(false);
        setTermSummary(null);
        setTermLoading(false);
    }, [open, initial?.transactionId, initial?.paymentType, initial?.studentId, initial?.monthYear, initial?.feeTerm]);

    const paymentTypeOptions = useMemo<SearchableSelectOption[]>(
        () => [...PAYMENT_TYPE_OPTIONS],
        []
    );

    const feeTermOptions = useMemo<SearchableSelectOption[]>(
        () => [...FEE_TERM_OPTIONS],
        []
    );

    const monthYearOptions = useMemo<SearchableSelectOption[]>(() => {
        const base = (monthOptions || []).map((m) => ({ value: m, label: m, keywords: m }));
        if (monthYear && !base.some((o) => String(o.value) === String(monthYear))) {
            base.unshift({ value: monthYear, label: String(monthYear), keywords: String(monthYear) });
        }
        return base;
    }, [monthOptions, monthYear]);

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
                    const priority: ('term1' | 'term2' | 'books')[] = ['term1', 'term2', 'books'];
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

    const initialStudentOption = useMemo(() => {
        if (!initial?.studentId) return null;
        const fullName = String(initial?.studentName || '').trim();
        const roll = initial?.rollNumber ? ` (${initial.rollNumber})` : '';
        const divisionSuffix = initial?.division ? `-${initial.division}` : '';
        const classLabel = initial?.className ? ` (${initial.className}${divisionSuffix})` : '';
        const label = `${fullName}${roll}${classLabel}`.trim() || `Student (${initial.studentId})`;
        return { value: String(initial.studentId), label };
    }, [initial?.studentId, initial?.studentName, initial?.rollNumber, initial?.className, initial?.division]);

    const fetchStudentOptions = useCallback(
        async (q: string) => {
            const params = new URLSearchParams();
            params.set('academicYearId', academicYearId);
            params.set('branchId', branchId);
            params.set('q', q);
            params.set('limit', '30');
            const res = await fetch(`/api/students/directory-search?${params.toString()}`, { credentials: 'include' });
            if (!res.ok) return [];
            const json = (await res.json()) as { options?: Array<{ value: string; label: string; keywords?: string }> };
            return json?.options || [];
        },
        [academicYearId, branchId]
    );

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (mode !== 'edit' && !selectedStudentId) {
            setError('Please select a student');
            return;
        }
        if (!monthYear) {
            setError('Please select Upto Month');
            return;
        }
        setSubmitting(true);
        setError('');

        const formData = new FormData(e.currentTarget);
        formData.set('academicYearId', academicYearId);
        formData.set('paymentType', paymentType);
        formData.set('monthYear', monthYear);
        if (feeTerm) formData.set('feeTerm', feeTerm);

        try {
            const res =
                mode === 'edit'
                    ? await updateFeePayment(initial!.transactionId, formData)
                    : await addFeePayment(formData);
            if (res?.error) {
                setError(res.error);
                onDone?.(res);
                return;
            }
            onDone?.(res);
        } catch (err) {
            const msg = (err as Error)?.message || 'Payment failed';
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
                        <Grid size={{ xs: 12, md: 6 }}>
                            <AsyncSearchableSelect
                                name="studentId"
                                label="Student"
                                placeholder="Type to search (name / roll no / class)"
                                value={selectedStudentId}
                                onChange={(next) => setSelectedStudentId(next)}
                                fetchOptions={fetchStudentOptions}
                                required
                                disabled={mode === 'edit'}
                                listboxMaxHeight={360}
                                valueOption={mode === 'edit' ? initialStudentOption : null}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                label="Receipt No. (Preview)"
                                value={mode === 'edit' ? normalizeReceipt(initial?.receiptNumber) : receiptPreview}
                                fullWidth
                                disabled
                            />
                        </Grid>

                        <Grid size={{ xs: 12, sm: 4 }}>
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

                        <Grid size={{ xs: 12, sm: 4 }}>
                            <SearchableSelect
                                label="Payment Type"
                                placeholder="Select"
                                size="medium"
                                value={paymentType}
                                onChange={(next) => setPaymentType(next)}
                                options={paymentTypeOptions}
                                required
                                listboxMaxHeight={240}
                            />
                        </Grid>

                        <Grid size={{ xs: 12, sm: 4 }}>
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

                        <Grid size={{ xs: 12, sm: 6 }}>
                            <SearchableSelect
                                name="monthYear"
                                label="Upto Month"
                                placeholder="Select month"
                                size="medium"
                                value={monthYear}
                                onChange={(next) => setMonthYear(next)}
                                options={monthYearOptions}
                                required
                                listboxMaxHeight={360}
                            />
                        </Grid>

                        <Grid size={{ xs: 12, sm: 6 }}>
                            <SearchableSelect
                                label="Fee Term"
                                placeholder="Select"
                                size="medium"
                                value={feeTerm}
                                onChange={(next) => {
                                    setFeeTermTouched(true);
                                    setFeeTerm(next);
                                }}
                                options={feeTermOptions}
                                required
                                disableClearable
                                listboxMaxHeight={240}
                            />
                        </Grid>

                        {paymentType === 'bank' && (
                            <>
                                <Grid size={{ xs: 12, sm: 6 }}>
                                    <TextField name="payeeName" label="Payee Name" fullWidth required defaultValue={initial?.payeeName || ''} />
                                </Grid>
                                <Grid size={{ xs: 12, sm: 6 }}>
                                    <TextField name="bankName" label="Bank Name" fullWidth defaultValue={initial?.bankName || ''} />
                                </Grid>
                                <Grid size={{ xs: 12, sm: 6 }}>
                                    <TextField name="chequeNumber" label="Cheque Number" fullWidth defaultValue={initial?.chequeNumber || ''} />
                                </Grid>
                                <Grid size={{ xs: 12, sm: 6 }}>
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
                                <Grid size={{ xs: 12, sm: 6 }}>
                                    <TextField
                                        name="upiId"
                                        label="UPI ID / VPA"
                                        fullWidth
                                        placeholder="user@paytm, user@gpay, etc."
                                        defaultValue={initial?.upiId || ''}
                                    />
                                </Grid>
                                <Grid size={{ xs: 12, sm: 6 }}>
                                    <TextField
                                        name="upiReference"
                                        label="UPI Transaction ID"
                                        fullWidth
                                        placeholder="Transaction reference number"
                                        defaultValue={initial?.upiReference || ''}
                                    />
                                </Grid>
                                <Grid size={{ xs: 12 }}>
                                    <TextField name="payeeName" label="Payee Name" fullWidth defaultValue={initial?.payeeName || ''} />
                                </Grid>
                            </>
                        )}

                        <Grid size={{ xs: 12 }}>
                            <TextField name="notes" label="Notes" fullWidth defaultValue={initial?.notes || ''} />
                        </Grid>

                        {mode !== 'edit' && (
                            <Grid size={{ xs: 12 }}>
                                <Paper variant="outlined" sx={{ p: 2 }}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                                        Student Fee Summary
                                    </Typography>
                                    {!selectedStudentId ? (
                                        <Typography variant="body2" color="text.secondary">
                                            Select a student to view term summary and monthly status.
                                        </Typography>
                                    ) : termLoading ? (
                                        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                            {Array.from({ length: 3 }).map((_, i) => (
                                                <Skeleton key={i} variant="rounded" width={170} height={32} />
                                            ))}
                                        </Box>
                                    ) : termSummary ? (
                                        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                            {(['term1', 'term2', 'books'] as const).map((k) => {
                                                const t = termSummary?.terms?.[k] || {};
                                                const pending = Number(t.pending) || 0;
                                                return (
                                                    <Chip
                                                        key={k}
                                                        label={`${feeTermLabel(k)}: Pending \u20B9${pending.toLocaleString('en-IN')}`}
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
                            <Grid size={{ xs: 12 }}>
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
