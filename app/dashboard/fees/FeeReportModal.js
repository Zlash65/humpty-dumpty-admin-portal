'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Box,
    Typography,
    Divider,
    MenuItem,
    Select,
    InputLabel,
    FormControl,
    CircularProgress,
    Stack,
    Chip,
    Button,
} from '@mui/material';
import { teal } from '@mui/material/colors';
import AssessmentIcon from '@mui/icons-material/Assessment';
import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { DataGrid } from '@mui/x-data-grid';
import { getFeeReportRows } from '@/app/actions/feeRecord';

function escapeHtml(v) {
    return String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function formatNow() {
    try {
        return new Date().toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return new Date().toISOString();
    }
}

function divisionsFromCount(numDivisions) {
    const n = Math.max(1, Number(numDivisions) || 1);
    return Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
}

function downloadTextFile(filename, contents, mime = 'text/plain') {
    const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export default function FeeReportModal({
    open,
    onClose,
    academicYearId,
    branchId,
    yearName = '',
    branchName = '',
    classEntries = [],
}) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [selectedClassKey, setSelectedClassKey] = useState('');
    const [divisionOptions, setDivisionOptions] = useState([]);
    const [selectedDivision, setSelectedDivision] = useState('');

    const [rows, setRows] = useState([]);

    const reportGeneratedAt = useMemo(() => formatNow(), []);

    // Generate divisions when class is selected (Electron parity)
    useEffect(() => {
        if (!open) return;

        if (!selectedClassKey) {
            const allDivisions = new Set();
            (classEntries || []).forEach((entry) => {
                const divs = divisionsFromCount(entry?.numDivisions || 1);
                divs.forEach((d) => allDivisions.add(d));
            });
            setDivisionOptions(Array.from(allDivisions).sort());
            setSelectedDivision('');
            return;
        }

        const [cls, shift] = selectedClassKey.split('|||');
        const entry = (classEntries || []).find((e) => String(e.class) === String(cls) && String(e.shiftName || '') === String(shift || ''));
        const divs = divisionsFromCount(entry?.numDivisions || 1);
        setDivisionOptions(divs);
        setSelectedDivision('');
    }, [open, selectedClassKey, classEntries]);

    useEffect(() => {
        const run = async () => {
            if (!open) return;
            if (!selectedDivision) {
                setRows([]);
                return;
            }
            setLoading(true);
            setError('');
            try {
                const [cls, shift] = selectedClassKey ? selectedClassKey.split('|||') : ['', ''];
                const data = await getFeeReportRows({
                    academicYearId,
                    branchId,
                    className: cls || null,
                    shiftName: selectedClassKey ? (shift || '') : null,
                    section: selectedDivision || null,
                });
                setRows(data || []);
            } catch (e) {
                setError(e?.message || 'Failed to load fee report');
                setRows([]);
            } finally {
                setLoading(false);
            }
        };
        run();
    }, [open, selectedDivision, selectedClassKey, academicYearId, branchId]);

    const reportClassLabel = useMemo(() => {
        if (!selectedClassKey) return 'All';
        return selectedClassKey.replace('|||', ' • ');
    }, [selectedClassKey]);

    const reportDivisionLabel = useMemo(() => (selectedDivision ? selectedDivision : 'All'), [selectedDivision]);

    const dataWithAmounts = useMemo(() => {
        return (rows || []).map((r, idx) => {
            const terms = r.termSummary?.terms || {};
            const t1 = terms.term1 || { total: 0, paid: 0, pending: 0 };
            const t2 = terms.term2 || { total: 0, paid: 0, pending: 0 };
            const b = terms.books || { total: 0, paid: 0, pending: 0 };
            return {
                ...r,
                srNo: idx + 1,
                term1Total: Number(t1.total) || 0,
                term1Paid: Number(t1.paid) || 0,
                term1Pending: Number(t1.pending) || 0,
                term2Total: Number(t2.total) || 0,
                term2Paid: Number(t2.paid) || 0,
                term2Pending: Number(t2.pending) || 0,
                booksTotal: Number(b.total) || 0,
                booksPaid: Number(b.paid) || 0,
                booksPending: Number(b.pending) || 0,
            };
        });
    }, [rows]);

    const grandTotals = useMemo(() => {
        return dataWithAmounts.reduce(
            (acc, s) => ({
                term1Total: acc.term1Total + (s.term1Total || 0),
                term1Paid: acc.term1Paid + (s.term1Paid || 0),
                term1Pending: acc.term1Pending + (s.term1Pending || 0),
                term2Total: acc.term2Total + (s.term2Total || 0),
                term2Paid: acc.term2Paid + (s.term2Paid || 0),
                term2Pending: acc.term2Pending + (s.term2Pending || 0),
                booksTotal: acc.booksTotal + (s.booksTotal || 0),
                booksPaid: acc.booksPaid + (s.booksPaid || 0),
                booksPending: acc.booksPending + (s.booksPending || 0),
            }),
            {
                term1Total: 0,
                term1Paid: 0,
                term1Pending: 0,
                term2Total: 0,
                term2Paid: 0,
                term2Pending: 0,
                booksTotal: 0,
                booksPaid: 0,
                booksPending: 0,
            }
        );
    }, [dataWithAmounts]);

    const columns = useMemo(() => {
        const currency = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
        const currencyCell = (params) => currency(params.value);
        return [
            { field: 'srNo', headerName: 'Sr. No.', width: 80, headerAlign: 'center', align: 'center' },
            {
                field: 'name',
                headerName: 'Student Name',
                width: 220,
                valueGetter: (_value, row) => {
                    const rn = row?.rollNumber || '';
                    return rn ? `${row?.name || ''} (${rn})` : (row?.name || '');
                },
            },
            { field: 'term1Total', headerName: 'Term1 Total', width: 120, headerAlign: 'center', align: 'right', renderCell: currencyCell },
            { field: 'term1Paid', headerName: 'Term1 Paid', width: 120, headerAlign: 'center', align: 'right', renderCell: currencyCell },
            { field: 'term1Pending', headerName: 'Term1 Pending', width: 130, headerAlign: 'center', align: 'right', renderCell: currencyCell },
            { field: 'term2Total', headerName: 'Term2 Total', width: 120, headerAlign: 'center', align: 'right', renderCell: currencyCell },
            { field: 'term2Paid', headerName: 'Term2 Paid', width: 120, headerAlign: 'center', align: 'right', renderCell: currencyCell },
            { field: 'term2Pending', headerName: 'Term2 Pending', width: 130, headerAlign: 'center', align: 'right', renderCell: currencyCell },
            { field: 'booksTotal', headerName: 'Books Total', width: 120, headerAlign: 'center', align: 'right', renderCell: currencyCell },
            { field: 'booksPaid', headerName: 'Books Paid', width: 120, headerAlign: 'center', align: 'right', renderCell: currencyCell },
            { field: 'booksPending', headerName: 'Books Pending', width: 130, headerAlign: 'center', align: 'right', renderCell: currencyCell },
        ];
    }, []);

    const buildReportHtml = useCallback(() => {
        const htmlRows = dataWithAmounts
            .map((s) => {
                const row = {
                    srNo: s.srNo,
                    name: s.rollNumber ? `${s.name} (${s.rollNumber})` : s.name,
                    term1Total: s.term1Total,
                    term1Paid: s.term1Paid,
                    term1Pending: s.term1Pending,
                    term2Total: s.term2Total,
                    term2Paid: s.term2Paid,
                    term2Pending: s.term2Pending,
                    booksTotal: s.booksTotal,
                    booksPaid: s.booksPaid,
                    booksPending: s.booksPending,
                };
                return `<tr>
  <td>${escapeHtml(row.srNo)}</td>
  <td>${escapeHtml(row.name)}</td>
  <td>₹${Number(row.term1Total || 0).toLocaleString('en-IN')}</td>
  <td>₹${Number(row.term1Paid || 0).toLocaleString('en-IN')}</td>
  <td>₹${Number(row.term1Pending || 0).toLocaleString('en-IN')}</td>
  <td>₹${Number(row.term2Total || 0).toLocaleString('en-IN')}</td>
  <td>₹${Number(row.term2Paid || 0).toLocaleString('en-IN')}</td>
  <td>₹${Number(row.term2Pending || 0).toLocaleString('en-IN')}</td>
  <td>₹${Number(row.booksTotal || 0).toLocaleString('en-IN')}</td>
  <td>₹${Number(row.booksPaid || 0).toLocaleString('en-IN')}</td>
  <td>₹${Number(row.booksPending || 0).toLocaleString('en-IN')}</td>
</tr>`;
            })
            .join('');

        return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Fee Report</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 16px; }
    .header { margin-bottom: 12px; text-align: center; }
    .branch { margin: 0; font-size: 20px; font-weight: 700; }
    .subject { margin: 2px 0 0 0; font-size: 13px; color: #333; }
    .meta { margin: 4px 0 8px 0; font-size: 12px; color: #555; }
    .chip { display: inline-block; border: 1px solid #bbb; border-radius: 12px; padding: 2px 8px; font-size: 11px; margin-right: 6px; margin-bottom: 6px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #999; padding: 6px 8px; font-size: 12px; text-align: left; }
    th { background: #f0f0f0; }
    @media print {
      @page { size: A4 landscape; margin: 10mm; }
      thead { display: table-header-group; }
      tfoot { display: table-row-group; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="branch">${escapeHtml(branchName || 'Branch')}</div>
    <div class="subject">Fee Report</div>
    <div class="meta">${escapeHtml(reportGeneratedAt)} • Total: ${dataWithAmounts.length}</div>
    <div>
      <span class="chip">Year: ${escapeHtml(yearName || '')}</span>
      <span class="chip">Class: ${escapeHtml(reportClassLabel)}</span>
      <span class="chip">Division: ${escapeHtml(reportDivisionLabel)}</span>
    </div>
  </div>
  <table>
    <colgroup>
      <col style="width:5%" />
      <col style="width:20%" />
      <col style="width:7.5%" /><col style="width:7.5%" /><col style="width:7.5%" />
      <col style="width:7.5%" /><col style="width:7.5%" /><col style="width:7.5%" />
      <col style="width:7.5%" /><col style="width:7.5%" /><col style="width:7.5%" />
    </colgroup>
    <thead>
      <tr>
        <th rowspan="2">Sr. No.</th>
        <th rowspan="2">Student Name</th>
        <th colspan="3" style="text-align:center;">Term1</th>
        <th colspan="3" style="text-align:center;">Term2</th>
        <th colspan="3" style="text-align:center;">Books</th>
      </tr>
      <tr>
        <th>Total</th><th>Paid</th><th>Pending</th>
        <th>Total</th><th>Paid</th><th>Pending</th>
        <th>Total</th><th>Paid</th><th>Pending</th>
      </tr>
    </thead>
    <tbody>
      ${htmlRows}
    </tbody>
    <tfoot>
      <tr style="border-top:2px solid #333; background:#f5f5f5;">
        <td colspan="2" style="font-weight:bold; text-align:right;">Grand Total:</td>
        <td style="font-weight:bold;">₹${grandTotals.term1Total.toLocaleString('en-IN')}</td>
        <td style="font-weight:bold;">₹${grandTotals.term1Paid.toLocaleString('en-IN')}</td>
        <td style="font-weight:bold;">₹${grandTotals.term1Pending.toLocaleString('en-IN')}</td>
        <td style="font-weight:bold;">₹${grandTotals.term2Total.toLocaleString('en-IN')}</td>
        <td style="font-weight:bold;">₹${grandTotals.term2Paid.toLocaleString('en-IN')}</td>
        <td style="font-weight:bold;">₹${grandTotals.term2Pending.toLocaleString('en-IN')}</td>
        <td style="font-weight:bold;">₹${grandTotals.booksTotal.toLocaleString('en-IN')}</td>
        <td style="font-weight:bold;">₹${grandTotals.booksPaid.toLocaleString('en-IN')}</td>
        <td style="font-weight:bold;">₹${grandTotals.booksPending.toLocaleString('en-IN')}</td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`;
    }, [dataWithAmounts, branchName, reportGeneratedAt, yearName, reportClassLabel, reportDivisionLabel, grandTotals]);

    const printReport = useCallback(() => {
        const html = buildReportHtml();
        const w = window.open('', '_blank');
        if (!w) return;
        w.document.open();
        w.document.write(html.replace('</body>', '<script>window.onload=function(){window.print();}</script></body>'));
        w.document.close();
    }, [buildReportHtml]);

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullWidth={false}
            maxWidth={false}
            PaperProps={{ sx: { width: '90vw', height: '85vh', maxWidth: '90vw', maxHeight: '85vh' } }}
        >
            <DialogTitle sx={{ pb: 1 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <AssessmentIcon sx={{ color: teal[700] }} />
                        <Box>
                            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1 }}>
                                Fee Report
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                {reportGeneratedAt} • Total: {dataWithAmounts.length}
                            </Typography>
                        </Box>
                    </Stack>
                </Stack>
            </DialogTitle>
            <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                    <Chip size="small" label={`Year: ${yearName || '-'}`} />
                    <Chip size="small" label={`Branch: ${branchName || '-'}`} />
                    <Chip size="small" label={`Class: ${reportClassLabel}`} />
                    <Chip size="small" label={`Division: ${reportDivisionLabel}`} />
                </Stack>
                <Divider sx={{ my: 1 }} />

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 1 }} alignItems="center">
                    <FormControl size="small" sx={{ minWidth: 260 }}>
                        <InputLabel>Class</InputLabel>
                        <Select
                            label="Class"
                            value={selectedClassKey}
                            onChange={(e) => setSelectedClassKey(e.target.value)}
                            renderValue={(selected) => selected ? selected.replace('|||', ' • ') : 'All Classes'}
                        >
                            <MenuItem value=""><em>All Classes</em></MenuItem>
                            {(classEntries || []).map((ce) => (
                                <MenuItem key={ce._id} value={`${ce.class}|||${ce.shiftName || ''}`}>
                                    {ce.class}{ce.shiftName ? ` • ${ce.shiftName}` : ''}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <FormControl size="small" sx={{ minWidth: 160 }}>
                        <InputLabel>Division</InputLabel>
                        <Select
                            label="Division"
                            value={selectedDivision}
                            onChange={(e) => setSelectedDivision(e.target.value)}
                            displayEmpty
                            renderValue={(selected) => selected ? selected : 'Select Division'}
                        >
                            <MenuItem value=""><em>Select Division</em></MenuItem>
                            {divisionOptions.map((d) => (
                                <MenuItem key={d} value={d}>{d}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <Button
                        startIcon={<RestartAltIcon />}
                        variant="text"
                        color="inherit"
                        onClick={() => {
                            setSelectedClassKey('');
                            setSelectedDivision('');
                            setRows([]);
                        }}
                        sx={{ ml: 'auto' }}
                    >
                        Reset
                    </Button>
                </Stack>

                {loading && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
                        <CircularProgress size={18} />
                        <Typography variant="body2" color="text.secondary">
                            Loading report...
                        </Typography>
                    </Box>
                )}
                {error && (
                    <Typography variant="body2" color="error">
                        {error}
                    </Typography>
                )}

                <Box sx={{ flex: 1, minHeight: 0 }}>
                    <DataGrid
                        rows={dataWithAmounts}
                        getRowId={(row) => row._id}
                        columns={columns}
                        density="compact"
                        disableRowSelectionOnClick
                        autoHeight={false}
                        sx={{ height: '100%' }}
                        pageSizeOptions={[10, 25, 50]}
                        initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
                    />
                </Box>
            </DialogContent>
            <DialogActions>
                <Button
                    variant="outlined"
                    startIcon={<DownloadIcon />}
                    disabled={!dataWithAmounts.length}
                    onClick={() => downloadTextFile(`fee-report-${Date.now()}.html`, buildReportHtml(), 'text/html')}
                >
                    Download HTML
                </Button>
                <Button
                    variant="contained"
                    startIcon={<PrintIcon />}
                    disabled={!dataWithAmounts.length}
                    onClick={printReport}
                >
                    Print
                </Button>
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    );
}
