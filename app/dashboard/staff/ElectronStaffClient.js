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
    Tooltip,
    Chip,
    Divider,
    FormControl,
    InputLabel,
    Select,
    Stack,
} from '@mui/material';
import { Add as AddIcon, Print as PrintIcon, Person as PersonIcon, RestartAlt as ResetIcon, Download as DownloadIcon } from '@mui/icons-material';
import {
    DataGrid,
    GridToolbarContainer,
    GridToolbarColumnsButton,
    GridToolbarFilterButton,
    GridToolbarDensitySelector,
    GridToolbarExport,
} from '@mui/x-data-grid';
import { createStaff, deleteStaff, getStaff, updateStaff } from '@/app/actions/staff';
import { getStudentsByTeacher } from '@/app/actions/student';
import { getUiSetting, setUiSetting } from '@/app/actions/uiSettings';

const DEFAULT_COLUMN_VISIBILITY = {
    srNo: true,
    name: true,
    staff_type: true,
    assignments_display: true,
    contact: true,
};

function normalizeStaffColumnsModel(model) {
    if (!model || typeof model !== 'object') return null;
    const map = {
        staffType: 'staff_type',
        assignments: 'assignments_display',
    };
    const out = { ...model };
    for (const [oldKey, newKey] of Object.entries(map)) {
        if (Object.prototype.hasOwnProperty.call(out, oldKey) && !Object.prototype.hasOwnProperty.call(out, newKey)) {
            out[newKey] = out[oldKey];
        }
    }
    return out;
}

function classEntryLabel(entry) {
    if (!entry) return '';
    const shift = entry.shiftName ? ` • ${entry.shiftName}` : '';
    return `${entry.class}${shift}`;
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

function escapeHtml(v) {
    return String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function formatNow() {
    try {
        return new Date().toLocaleString('en-IN');
    } catch {
        return new Date().toISOString();
    }
}

function groupAssignments(assignments = []) {
    const grouped = new Map();
    for (const a of assignments || []) {
        const cls = (a?.className || '').toString().trim();
        const shift = (a?.shiftName || '').toString().trim();
        if (!cls) continue;
        const key = `${cls}|||${shift}`;
        const div = (a?.division || '').toString().trim().toUpperCase();
        if (!grouped.has(key)) grouped.set(key, new Set());
        if (div) grouped.get(key).add(div);
    }

    const parts = [];
    for (const [key, divs] of grouped.entries()) {
        const [cls, shift] = key.split('|||');
        const divList = Array.from(divs).sort();
        const divLabel = divList.length ? ` (${divList.join(', ')})` : '';
        const shiftLabel = shift ? ` • ${shift}` : '';
        parts.push(`${cls}${shiftLabel}${divLabel}`);
    }
    return parts.join(' • ') || '-';
}

export default function ElectronStaffClient({
    staff = [],
    classEntries = [],
    branches = [],
    academicYearId,
    branchId,
    branchName = '',
    yearName = '',
}) {
    const router = useRouter();
    const [message, setMessage] = useState(null);
    const [query, setQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const searchTimerRef = useRef(null);

    const [addOpen, setAddOpen] = useState(false);
    const [editRow, setEditRow] = useState(null);
    const [deleteRow, setDeleteRow] = useState(null);

    const [reportOpen, setReportOpen] = useState(false);
    const [reportTeacherId, setReportTeacherId] = useState('');
    const [reportClassKey, setReportClassKey] = useState('');
    const [reportDivision, setReportDivision] = useState('');
    const [reportRows, setReportRows] = useState([]);
    const [reportLoading, setReportLoading] = useState(false);

    const [columnVisibility, setColumnVisibility] = useState(DEFAULT_COLUMN_VISIBILITY);
    const persistTimerRef = useRef(null);
    const lastQueuedVisibilityRef = useRef(JSON.stringify(DEFAULT_COLUMN_VISIBILITY));
    const lastSavedVisibilityRef = useRef(JSON.stringify(DEFAULT_COLUMN_VISIBILITY));

    useEffect(() => {
        (async () => {
            try {
                const saved = await getUiSetting('staffTableSettings');
                const model = normalizeStaffColumnsModel(saved?.columnVisibilityModel);
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
                await setUiSetting('staffTableSettings', { columnVisibilityModel: next }, 'general');
                lastSavedVisibilityRef.current = json;
            } catch {
                // ignore
            }
        }, 600);
    };

    useEffect(() => {
        return () => {
            if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        };
    }, []);

    const baseStaff = useMemo(() => {
        const useServer = String(query || '').trim().length >= 2;
        return useServer ? searchResults : staff;
    }, [query, searchResults, staff]);

    useEffect(() => {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        const q = String(query || '').trim();
        if (q.length < 2) {
            setSearching(false);
            setSearchResults([]);
            return;
        }

        searchTimerRef.current = setTimeout(async () => {
            try {
                setSearching(true);
                const res = await getStaff({ search: q, limit: 500 });
                setSearchResults(Array.isArray(res) ? res : []);
            } catch {
                setSearchResults([]);
            } finally {
                setSearching(false);
            }
        }, 300);

        return () => {
            if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        };
    }, [query]);

    const teachers = useMemo(() => (baseStaff || []).filter((s) => s.staffType === 'teacher'), [baseStaff]);

    const staffRows = useMemo(() => {
        const q = String(query || '').trim().toLowerCase();
        const base = (baseStaff || []).map((s, idx) => ({
            ...s,
            srNo: idx + 1,
        }));
        const useServer = String(query || '').trim().length >= 2;
        if (useServer || !q) return base;
        return base.filter((s) => (
            String(s.name || '').toLowerCase().includes(q) ||
            String(s.contact || '').toLowerCase().includes(q) ||
            String(s.role || '').toLowerCase().includes(q)
        ));
    }, [baseStaff, query]);

    const buildTeacherReportHtml = useMemo(() => {
        return (rows, { teacherName } = {}) => {
            const now = formatNow();
            const htmlRows = (rows || [])
                .map((r, idx) => {
                    const row = {
                        srNo: idx + 1,
                        name: r.name || '',
                        parents_contact1: r.parentContact1 || '',
                        parents_contact2: r.parentContact2 || '',
                        class_display: `${r.className || ''}${r.section ? ` (${r.section})` : ''}${r.shiftName ? ` • ${r.shiftName}` : ''}`,
                    };
                    return `<tr>
  <td>${escapeHtml(row.srNo)}</td>
  <td>${escapeHtml(row.name)}</td>
  <td>${escapeHtml(row.parents_contact1)}</td>
  <td>${escapeHtml(row.parents_contact2)}</td>
  <td>${escapeHtml(row.class_display)}</td>
</tr>`;
                })
                .join('');

            return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Teacher Student Report</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 16px; }
    .header { margin-bottom: 12px; text-align: center; }
    .branch { margin: 0; font-size: 20px; font-weight: 700; }
    .subject { margin: 2px 0 0 0; font-size: 13px; color: #333; }
    .meta { margin: 4px 0 8px 0; font-size: 12px; color: #555; }
    .chip { display: inline-block; border: 1px solid #bbb; border-radius: 12px; padding: 2px 8px; font-size: 11px; margin-right: 6px; margin-bottom: 6px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #999; padding: 6px 8px; font-size: 12px; }
    th { background: #f0f0f0; text-align: left; }
    @media print { @page { size: A4; margin: 12mm; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="branch">${escapeHtml(branchName || 'Branch')}</div>
    <div class="subject">Teacher-wise Student Report</div>
    <div class="meta">${escapeHtml(now)} • Total: ${(rows || []).length}</div>
    <div>
      <span class="chip">Year: ${escapeHtml(yearName || '')}</span>
      <span class="chip">Teacher: ${escapeHtml(teacherName || '')}</span>
    </div>
  </div>
  <table>
    <thead><tr><th>Sr No</th><th>Student Name</th><th>Parent Contact 1</th><th>Parent Contact 2</th><th>Class</th></tr></thead>
    <tbody>${htmlRows}</tbody>
  </table>
</body>
</html>`;
        };
    }, [branchName, yearName]);

    const selectedTeacher = useMemo(
        () => teachers.find((t) => String(t._id) === String(reportTeacherId)) || null,
        [teachers, reportTeacherId]
    );

    const teacherAssignedClasses = useMemo(() => {
        if (!selectedTeacher?.assignments?.length) return [];
        const seen = new Map();
        for (const a of selectedTeacher.assignments) {
            const cls = (a?.className || '').toString().trim();
            const shift = (a?.shiftName || '').toString().trim();
            if (!cls) continue;
            const key = `${cls}|||${shift}`;
            if (!seen.has(key)) {
                seen.set(key, { key, className: cls, shiftName: shift, label: `${cls}${shift ? ` • ${shift}` : ''}` });
            }
        }
        return Array.from(seen.values()).sort((x, y) => x.label.localeCompare(y.label));
    }, [selectedTeacher]);

    const availableDivisions = useMemo(() => {
        if (!selectedTeacher?.assignments?.length) return [];
        if (!reportClassKey) return [];
        const [cls, shift] = reportClassKey.split('|||');
        const divs = new Set();
        for (const a of selectedTeacher.assignments) {
            if (String(a?.className || '') !== String(cls || '')) continue;
            if (String(a?.shiftName || '') !== String(shift || '')) continue;
            const d = (a?.division || '').toString().trim().toUpperCase();
            if (d) divs.add(d);
        }
        // If teacher has "all divisions" assignment, show divisions from class entry config.
        if (divs.size === 0) {
            const entry = (classEntries || []).find((e) => String(e.class) === String(cls) && String(e.shiftName || '') === String(shift || ''));
            return divisionsFromCount(entry?.numDivisions || 1);
        }
        return Array.from(divs).sort();
    }, [selectedTeacher, reportClassKey, classEntries]);

    useEffect(() => {
        const run = async () => {
            if (!reportOpen) return;
            if (!reportTeacherId) {
                setReportRows([]);
                return;
            }
            setReportLoading(true);
            try {
                const [cls, shift] = (reportClassKey || '').split('|||');
                const rows = await getStudentsByTeacher({
                    teacherId: reportTeacherId,
                    academicYearId,
                    branchId,
                    className: cls || null,
                    shiftName: shift || null,
                    section: reportDivision || null,
                });
                setReportRows(rows || []);
            } catch (e) {
                setReportRows([]);
                setMessage({ type: 'error', text: e?.message || 'Failed to load report' });
            } finally {
                setReportLoading(false);
            }
        };
        run();
    }, [reportOpen, reportTeacherId, reportClassKey, reportDivision, academicYearId, branchId]);

    const columns = useMemo(() => {
        return [
            {
                field: 'srNo',
                headerName: 'Sr No',
                width: 100,
                sortable: false,
                filterable: false,
                headerAlign: 'center',
                align: 'center',
            },
            {
                field: 'name',
                headerName: 'Name',
                flex: 1,
                minWidth: 160,
            },
            {
                field: 'staff_type',
                headerName: 'Type',
                width: 120,
                valueGetter: (_value, row) => row?.staffType || 'office',
                renderCell: (params) => {
                    const type = params.value;
                    const displayText = type === 'teacher' ? 'Teacher' : 'Office Staff';
                    return (
                        <Tooltip title={displayText}>
                            <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {displayText}
                            </span>
                        </Tooltip>
                    );
                },
            },
            {
                field: 'assignments_display',
                headerName: 'Classes',
                flex: 1.2,
                minWidth: 220,
                valueGetter: (_value, row) => groupAssignments(row?.assignments || []),
                renderCell: (params) => {
                    if (params.row?.staffType !== 'teacher') return <span style={{ color: '#999' }}>-</span>;
                    const full = groupAssignments(params.row?.assignments || []);
                    return (
                        <Tooltip title={full}>
                            <Box sx={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {full}
                            </Box>
                        </Tooltip>
                    );
                },
            },
            {
                field: 'contact',
                headerName: 'Contact',
                width: 180,
                valueGetter: (_value, row) => row?.contact || '',
                renderCell: (params) => (
                    <Tooltip title={params.value || ''}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{params.value || ''}</span>
                    </Tooltip>
                ),
            },
            {
                field: '__actions',
                headerName: 'Actions',
                width: 180,
                sortable: false,
                filterable: false,
                hideable: false,
                renderCell: (params) => (
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                        <Button
                            variant="contained"
                            color="primary"
                            size="small"
                            onClick={() => setEditRow(params.row)}
                            sx={{ mr: 1 }}
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
        const fileName = `staff-${branchName || 'all'}-${yearName || ''}`.trim().replace(/\\s+/g, '-');
        return (
            <GridToolbarContainer sx={{ justifyContent: 'space-between', p: 1 }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <GridToolbarColumnsButton />
                    <GridToolbarFilterButton />
                    <GridToolbarDensitySelector />
                    {searching && <Chip size="small" label="Searching..." />}
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
                    <Typography variant="h4" fontWeight="bold">Staff</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Staff directory (Electron parity){branchName ? ` • ${branchName}` : ''}{yearName ? ` • ${yearName}` : ''}
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="outlined" color="secondary" onClick={() => {
                        setReportTeacherId('');
                        setReportClassKey('');
                        setReportDivision('');
                        setReportRows([]);
                        setReportOpen(true);
                    }}>
                        Report
                    </Button>
                    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
                        + Add Staff
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
                    placeholder="Search by name, contact, role..."
                    label="Search"
                    fullWidth
                />
            </Paper>

            <Paper sx={{ p: 1 }}>
                <DataGrid
                    rows={staffRows}
                    columns={columns}
                    getRowId={(row) => row._id}
                    autoHeight
                    disableRowSelectionOnClick
                    pageSizeOptions={[10]}
                    initialState={{
                        pagination: { paginationModel: { pageSize: 10, page: 0 } },
                        sorting: { sortModel: [{ field: 'srNo', sort: 'asc' }] },
                    }}
                    columnVisibilityModel={columnVisibility}
                    onColumnVisibilityModelChange={queuePersistColumns}
                    slots={{ toolbar: GridToolbar }}
                />
            </Paper>

            <StaffDialog
                mode="add"
                open={addOpen}
                onClose={() => setAddOpen(false)}
                branchId={branchId}
                classEntries={classEntries}
                branches={branches}
                onDone={(res) => {
                    if (res?.error) setMessage({ type: 'error', text: res.error });
                    else setMessage({ type: 'success', text: 'Staff added.' });
                    setAddOpen(false);
                    router.refresh();
                }}
            />

            <StaffDialog
                mode="edit"
                open={!!editRow}
                onClose={() => setEditRow(null)}
                branchId={branchId}
                classEntries={classEntries}
                branches={branches}
                initial={editRow}
                onDone={(res) => {
                    if (res?.error) setMessage({ type: 'error', text: res.error });
                    else setMessage({ type: 'success', text: 'Staff updated.' });
                    setEditRow(null);
                    router.refresh();
                }}
            />

            <Dialog open={!!deleteRow} onClose={() => setDeleteRow(null)}>
                <DialogTitle>Delete Staff</DialogTitle>
                <DialogContent dividers>
                    <Typography>
                        Delete <strong>{deleteRow?.name}</strong>?
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteRow(null)}>Cancel</Button>
                    <Button
                        color="error"
                        variant="contained"
                        onClick={async () => {
                            const res = await deleteStaff(deleteRow._id);
                            if (res?.error) setMessage({ type: 'error', text: res.error });
                            else setMessage({ type: 'success', text: 'Staff deleted.' });
                            setDeleteRow(null);
                            router.refresh();
                        }}
                    >
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={reportOpen} onClose={() => setReportOpen(false)} fullWidth maxWidth="lg">
                <DialogTitle sx={{ pb: 1 }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                            <PersonIcon color="primary" />
                            <Box>
                                <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1 }}>
                                    Teacher-wise Student Report
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {formatNow()} • Total: {reportRows.length}
                                </Typography>
                            </Box>
                        </Stack>
                    </Stack>
                </DialogTitle>
                <DialogContent dividers>
                    <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap' }}>
                        <Chip size="small" label={`Year: ${yearName || '-'}`} />
                        <Chip size="small" label={`Branch: ${branchName || '-'}`} />
                        {selectedTeacher && <Chip size="small" label={`Teacher: ${selectedTeacher.name}`} />}
                        {reportClassKey && <Chip size="small" label={`Class: ${reportClassKey.replace('|||', ' • ')}`} />}
                        {reportDivision && <Chip size="small" label={`Division: ${reportDivision}`} />}
                    </Stack>
                    <Divider sx={{ mb: 2 }} />

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }} alignItems="center">
                        <FormControl size="small" sx={{ minWidth: 220 }}>
                            <InputLabel>Teacher</InputLabel>
                            <Select
                                label="Teacher"
                                value={reportTeacherId}
                                onChange={(e) => {
                                    setReportTeacherId(e.target.value);
                                    setReportClassKey('');
                                    setReportDivision('');
                                }}
                            >
                                <MenuItem value=""><em>Select Teacher</em></MenuItem>
                                {teachers.map((t) => (
                                    <MenuItem key={t._id} value={t._id}>{t.name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <FormControl size="small" sx={{ minWidth: 220 }} disabled={!reportTeacherId}>
                            <InputLabel>Class</InputLabel>
                            <Select
                                label="Class"
                                value={reportClassKey}
                                onChange={(e) => {
                                    setReportClassKey(e.target.value);
                                    setReportDivision('');
                                }}
                                renderValue={(selected) => selected ? selected.replace('|||', ' • ') : 'All Classes'}
                            >
                                <MenuItem value=""><em>All Classes</em></MenuItem>
                                {teacherAssignedClasses.map((c) => (
                                    <MenuItem key={c.key} value={c.key}>{c.label}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <FormControl
                            size="small"
                            sx={{ minWidth: 140 }}
                            disabled={!reportTeacherId || !reportClassKey || availableDivisions.length === 0}
                        >
                            <InputLabel>Division</InputLabel>
                            <Select
                                label="Division"
                                value={reportDivision}
                                onChange={(e) => setReportDivision(e.target.value)}
                                renderValue={(selected) => selected ? selected : 'All'}
                            >
                                <MenuItem value=""><em>All</em></MenuItem>
                                {availableDivisions.map((d) => (
                                    <MenuItem key={d} value={d}>{d}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <Button
                            startIcon={<ResetIcon />}
                            variant="text"
                            color="inherit"
                            onClick={() => {
                                setReportTeacherId('');
                                setReportClassKey('');
                                setReportDivision('');
                                setReportRows([]);
                            }}
                            sx={{ ml: 'auto' }}
                        >
                            Reset
                        </Button>
                    </Stack>

                    <Paper sx={{ p: 1 }}>
                        <DataGrid
                            rows={reportRows.map((r, idx) => ({ ...r, srNo: idx + 1 }))}
                            getRowId={(row) => row._id || `${row.name}-${row.rollNumber}-${row.className}-${row.section}`}
                            columns={[
                                { field: 'srNo', headerName: 'Sr No', width: 90, align: 'center', headerAlign: 'center' },
                                { field: 'name', headerName: 'Name', flex: 1, minWidth: 200 },
                                { field: 'parentContact1', headerName: 'Parent Contact 1', width: 170 },
                                { field: 'parentContact2', headerName: 'Parent Contact 2', width: 170 },
                                {
                                    field: 'classDisplay',
                                    headerName: 'Class',
                                    flex: 0.8,
                                    minWidth: 160,
                                    valueGetter: (_value, row) =>
                                        `${row?.className || ''}${row?.section ? ` (${row.section})` : ''}${row?.shiftName ? ` • ${row.shiftName}` : ''}`,
                                },
                            ]}
                            autoHeight
                            disableRowSelectionOnClick
                            loading={reportLoading}
                            pageSizeOptions={[10]}
                            initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
                        />
                    </Paper>
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="outlined"
                        startIcon={<DownloadIcon />}
                        disabled={!reportRows.length}
                        onClick={() => {
                            const teacherName = selectedTeacher?.name || '';
                            const html = buildTeacherReportHtml(reportRows, { teacherName });
                            downloadTextFile(`teacher-student-report-${Date.now()}.html`, html, 'text/html');
                        }}
                    >
                        Download HTML
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<PrintIcon />}
                        disabled={!reportRows.length}
                        onClick={() => {
                            const teacherName = selectedTeacher?.name || '';
                            const html = buildTeacherReportHtml(reportRows, { teacherName });
                            const w = window.open('', '_blank');
                            if (!w) return;
                            w.document.open();
                            w.document.write(html.replace('</body>', '<script>window.onload=function(){window.print();}</script></body>'));
                            w.document.close();
                        }}
                    >
                        Print
                    </Button>
                    <Button onClick={() => setReportOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

function StaffDialog({ mode, open, onClose, branchId, classEntries, branches, initial, onDone }) {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const [staffType, setStaffType] = useState(initial?.staffType || 'office');
    const [assignmentsUi, setAssignmentsUi] = useState(() => {
        // UI shape: [{ classEntryId, classKey, divisions: [] }]
        // Prefer stable FeeStructure id when available; fall back to classKey for legacy data.
        const out = [];
        const grouped = new Map();
        const entries = Array.isArray(classEntries) ? classEntries : [];

        const resolveId = (cls, shift) => {
            const matchInBranch = entries.find(
                (ce) =>
                    String(ce.branchId || '') === String(branchId || '') &&
                    String(ce.class || '') === String(cls || '') &&
                    String(ce.shiftName || '') === String(shift || '')
            );
            const matchAny = entries.find(
                (ce) => String(ce.class || '') === String(cls || '') && String(ce.shiftName || '') === String(shift || '')
            );
            return (matchInBranch || matchAny)?._id ? String((matchInBranch || matchAny)._id) : '';
        };

        for (const a of initial?.assignments || []) {
            const cls = (a?.className || '').toString();
            const shift = (a?.shiftName || '').toString();
            if (!cls) continue;
            const classKey = `${cls}|||${shift}`;
            const id = a?.classEntryId ? String(a.classEntryId) : resolveId(cls, shift);
            const groupKey = id ? `id:${id}` : `legacy:${classKey}`;
            if (!grouped.has(groupKey)) grouped.set(groupKey, { classEntryId: id, classKey, divs: new Set() });
            const div = (a?.division || '').toString().trim().toUpperCase();
            if (div) grouped.get(groupKey).divs.add(div);
        }

        for (const info of grouped.values()) {
            out.push({ classEntryId: info.classEntryId, classKey: info.classKey, divisions: Array.from(info.divs) });
        }
        return out.length ? out : [{ classEntryId: '', classKey: '', divisions: [] }];
    });

    const branchNameById = useMemo(() => {
        const map = new Map();
        for (const b of branches || []) map.set(String(b._id), b.name);
        return map;
    }, [branches]);

    useEffect(() => {
        if (!open) return;
        setError('');
        setSubmitting(false);
        setStaffType(initial?.staffType || 'office');
        // Keep assignments from initial; if none, reset to one empty row.
        if (!initial?.assignments?.length) {
            setAssignmentsUi([{ classEntryId: '', classKey: '', divisions: [] }]);
            return;
        }

        const entries = Array.isArray(classEntries) ? classEntries : [];
        const resolveId = (cls, shift) => {
            const matchInBranch = entries.find(
                (ce) =>
                    String(ce.branchId || '') === String(branchId || '') &&
                    String(ce.class || '') === String(cls || '') &&
                    String(ce.shiftName || '') === String(shift || '')
            );
            const matchAny = entries.find(
                (ce) => String(ce.class || '') === String(cls || '') && String(ce.shiftName || '') === String(shift || '')
            );
            return (matchInBranch || matchAny)?._id ? String((matchInBranch || matchAny)._id) : '';
        };

        const grouped = new Map();
        for (const a of initial.assignments) {
            const cls = (a?.className || '').toString();
            const shift = (a?.shiftName || '').toString();
            if (!cls) continue;
            const classKey = `${cls}|||${shift}`;
            const id = a?.classEntryId ? String(a.classEntryId) : resolveId(cls, shift);
            const groupKey = id ? `id:${id}` : `legacy:${classKey}`;
            if (!grouped.has(groupKey)) grouped.set(groupKey, { classEntryId: id, classKey, divs: new Set() });
            const div = (a?.division || '').toString().trim().toUpperCase();
            if (div) grouped.get(groupKey).divs.add(div);
        }

        const nextUi = Array.from(grouped.values()).map((info) => ({
            classEntryId: info.classEntryId,
            classKey: info.classKey,
            divisions: Array.from(info.divs),
        }));
        setAssignmentsUi(nextUi.length ? nextUi : [{ classEntryId: '', classKey: '', divisions: [] }]);
    }, [open, initial?._id, initial?.staffType, initial?.assignments, branchId, classEntries]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');

        const formData = new FormData(e.currentTarget);
        formData.set('branchId', branchId || '');
        formData.set('staffType', staffType);

        const classEntryById = new Map();
        for (const ce of classEntries || []) classEntryById.set(String(ce._id), ce);

        // Convert UI assignments -> backend shape [{ classEntryId, branchId, className, shiftName, division }]
        if (staffType === 'teacher') {
            const assignments = [];
            for (const row of assignmentsUi) {
                const entryId = String(row.classEntryId || '').trim();
                const entry = entryId ? classEntryById.get(entryId) : null;

                const cls = entry?.class || (row.classKey ? row.classKey.split('|||')[0] : '');
                const shift = entry?.shiftName || (row.classKey ? row.classKey.split('|||')[1] : '');
                if (!cls) continue;

                const assignmentBranchId = entry?.branchId || branchId || '';
                const divs = Array.isArray(row.divisions) ? row.divisions : [];
                if (!divs.length) {
                    assignments.push({
                        classEntryId: entryId || undefined,
                        branchId: assignmentBranchId || undefined,
                        className: cls,
                        shiftName: shift || '',
                        division: '',
                    });
                    continue;
                }
                for (const d of divs) {
                    assignments.push({
                        classEntryId: entryId || undefined,
                        branchId: assignmentBranchId || undefined,
                        className: cls,
                        shiftName: shift || '',
                        division: String(d || '').toUpperCase(),
                    });
                }
            }
            if (assignments.length === 0) {
                setError('Teachers must have at least one class assignment');
                setSubmitting(false);
                return;
            }
            formData.set('assignments', JSON.stringify(assignments));
        } else {
            formData.delete('assignments');
        }

        try {
            const res =
                mode === 'edit'
                    ? await updateStaff(initial._id, formData)
                    : await createStaff(formData);
            if (res?.error) {
                setError(res.error);
                onDone?.(res);
                return;
            }
            onDone?.({ success: true });
        } catch (err) {
            const msg = err?.message || 'Failed to save staff';
            setError(msg);
            onDone?.({ error: msg });
        } finally {
            setSubmitting(false);
        }
    };

    const rowDivisions = (row) => {
        const entryId = String(row?.classEntryId || '').trim();
        const entryById = entryId ? (classEntries || []).find((e) => String(e._id) === entryId) : null;
        if (entryById) return divisionsFromCount(entryById?.numDivisions || 1);

        // Legacy fallback: match by class/shift
        const [cls, shift] = String(row?.classKey || '').split('|||');
        if (!cls) return [];
        const entry = (classEntries || []).find((e) => String(e.class) === String(cls) && String(e.shiftName || '') === String(shift || '')) || null;
        return divisionsFromCount(entry?.numDivisions || 1);
    };

    const classSelectOptions = useMemo(() => {
        const opts = (classEntries || []).map((ce) => {
            const bName = branchNameById.get(String(ce.branchId)) || '';
            const prefix = bName ? `${bName} • ` : '';
            return { id: String(ce._id), label: `${prefix}${classEntryLabel(ce)}` };
        });

        // Add legacy options if there are assignments we couldn't resolve.
        const legacy = [];
        for (const row of assignmentsUi || []) {
            if (row?.classEntryId) continue;
            const key = String(row?.classKey || '').trim();
            if (!key) continue;
            const [cls, shift] = key.split('|||');
            const display = `${cls}${shift ? ` • ${shift}` : ''} (Legacy)`;
            const id = `legacy:${key}`;
            if (!opts.some((o) => o.id === id) && !legacy.some((o) => o.id === id)) legacy.push({ id, label: display });
        }

        return [...opts, ...legacy];
    }, [classEntries, branchNameById, assignmentsUi]);

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>{mode === 'edit' ? 'Edit Staff' : 'Add Staff'}</DialogTitle>
            <Box component="form" onSubmit={handleSubmit}>
                <DialogContent dividers>
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                    <Grid container spacing={2}>
                        <Grid item xs={12} sm={6}>
                            <TextField name="name" label="Name" fullWidth required defaultValue={initial?.name || ''} />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField name="contact" label="Contact" fullWidth defaultValue={initial?.contact || ''} />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField name="email" label="Email" fullWidth defaultValue={initial?.email || ''} />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField name="role" label="Role" fullWidth defaultValue={initial?.role || ''} />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                select
                                label="Staff Type"
                                fullWidth
                                value={staffType}
                                onChange={(e) => setStaffType(e.target.value)}
                            >
                                <MenuItem value="office">Office Staff</MenuItem>
                                <MenuItem value="teacher">Teacher</MenuItem>
                            </TextField>
                        </Grid>

                        {staffType === 'teacher' && (
                            <Grid item xs={12}>
                                <Paper variant="outlined" sx={{ p: 2 }}>
                                    <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                                        Teacher Assignments
                                    </Typography>
                                    {(assignmentsUi || []).map((row, idx) => {
                                        const divs = rowDivisions(row);
                                        const selectValue =
                                            row.classEntryId
                                                ? String(row.classEntryId)
                                                : row.classKey
                                                    ? `legacy:${row.classKey}`
                                                    : '';
                                        return (
                                            <Box key={idx} sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 1, flexWrap: 'wrap' }}>
                                                <TextField
                                                    select
                                                    label="Class"
                                                    value={selectValue}
                                                    onChange={(e) => {
                                                        const raw = String(e.target.value || '');
                                                        const next = [...assignmentsUi];
                                                        if (raw.startsWith('legacy:')) {
                                                            const key = raw.slice('legacy:'.length);
                                                            next[idx] = { ...next[idx], classEntryId: '', classKey: key, divisions: [] };
                                                            setAssignmentsUi(next);
                                                            return;
                                                        }

                                                        const entry = (classEntries || []).find((ce) => String(ce._id) === raw) || null;
                                                        next[idx] = {
                                                            ...next[idx],
                                                            classEntryId: raw,
                                                            classKey: entry ? `${entry.class}|||${entry.shiftName || ''}` : '',
                                                            divisions: [],
                                                        };
                                                        setAssignmentsUi(next);
                                                    }}
                                                    sx={{ minWidth: 260 }}
                                                >
                                                    <MenuItem value="">Select Class</MenuItem>
                                                    {classSelectOptions.map((o) => (
                                                        <MenuItem key={o.id} value={o.id}>
                                                            {o.label}
                                                        </MenuItem>
                                                    ))}
                                                </TextField>
                                                <TextField
                                                    select
                                                    label="Divisions"
                                                    SelectProps={{ multiple: true, renderValue: (sel) => (sel?.length ? sel.join(', ') : 'All') }}
                                                    value={row.divisions || []}
                                                    onChange={(e) => {
                                                        const next = [...assignmentsUi];
                                                        next[idx] = { ...next[idx], divisions: e.target.value };
                                                        setAssignmentsUi(next);
                                                    }}
                                                    sx={{ minWidth: 260 }}
                                                    disabled={!selectValue}
                                                >
                                                    {divs.map((d) => (
                                                        <MenuItem key={d} value={d}>{d}</MenuItem>
                                                    ))}
                                                </TextField>
                                                <Button
                                                    color="error"
                                                    onClick={() => {
                                                        const next = assignmentsUi.filter((_, i) => i !== idx);
                                                        setAssignmentsUi(next.length ? next : [{ classEntryId: '', classKey: '', divisions: [] }]);
                                                    }}
                                                >
                                                    Remove
                                                </Button>
                                            </Box>
                                        );
                                    })}
                                    <Button
                                        variant="outlined"
                                        onClick={() => setAssignmentsUi([...assignmentsUi, { classEntryId: '', classKey: '', divisions: [] }])}
                                        sx={{ mt: 1 }}
                                    >
                                        + Add Assignment
                                    </Button>
                                </Paper>
                            </Grid>
                        )}
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose} disabled={submitting}>Cancel</Button>
                    <Button type="submit" variant="contained" disabled={submitting}>
                        {submitting ? 'Saving...' : mode === 'edit' ? 'Save' : 'Add'}
                    </Button>
                </DialogActions>
            </Box>
        </Dialog>
    );
}
