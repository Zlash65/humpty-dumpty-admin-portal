'use client';

import { useCallback, useEffect, useMemo, useRef, useState, FormEvent, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
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
    MenuItem,
    Alert,
    Tooltip,
    Chip,
    Divider,
    FormControl,
    InputLabel,
    Select,
    Stack,
    SelectChangeEvent,
    IconButton
} from '@mui/material';
import { Add as AddIcon, Print as PrintIcon, Person as PersonIcon, RestartAlt as ResetIcon, Download as DownloadIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
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
import { createStaff, deleteStaff, getStaff, updateStaff } from '@/app/actions/staff';
import { getStudentsByTeacher } from '@/app/actions/student';
import { getUiSetting, setUiSetting } from '@/app/actions/uiSettings';
import StandardDataGrid from '@/components/StandardDataGrid';
import BareDataGrid from '@/components/BareDataGrid';
import SearchableSelect, { type SearchableSelectOption } from '@/components/ui/SearchableSelect';
import useAsyncSearch from '@/components/ui/search/useAsyncSearch';

interface Assignment {
    classEntryId?: string;
    branchId?: string;
    className?: string;
    shiftName?: string;
    division?: string;
}

interface StaffMember {
    _id: string;
    name?: string;
    staffType?: string;
    contact?: string;
    email?: string;
    role?: string;
    assignments?: Assignment[];
}

interface StaffRow extends StaffMember {
    srNo: number;
}

interface ClassEntry {
    _id: string;
    class: string;
    shiftName?: string;
    numDivisions?: number;
    branchId?: string;
}

interface Branch {
    _id: string;
    name?: string;
}

interface StudentRow {
    _id: string;
    name?: string;
    rollNumber?: string;
    className?: string;
    section?: string;
    shiftName?: string;
    parentContact1?: string;
    parentContact2?: string;
}

interface Message {
    type: 'success' | 'error' | 'info' | 'warning';
    text: string;
}

interface ElectronStaffClientProps {
    staff?: StaffMember[];
    classEntries?: ClassEntry[];
    branches?: Branch[];
    academicYearId: string;
    branchId: string;
    branchName?: string;
    yearName?: string;
}

const DEFAULT_COLUMN_VISIBILITY: GridColumnVisibilityModel = {
    srNo: true,
    name: true,
    staff_type: true,
    assignments_display: true,
    contact: true,
};

function normalizeStaffColumnsModel(model: unknown): GridColumnVisibilityModel | null {
    if (!model || typeof model !== 'object') return null;
    const map: Record<string, string> = {
        staffType: 'staff_type',
        assignments: 'assignments_display',
    };
    const out = { ...(model as Record<string, boolean>) };
    for (const [oldKey, newKey] of Object.entries(map)) {
        if (Object.prototype.hasOwnProperty.call(out, oldKey) && !Object.prototype.hasOwnProperty.call(out, newKey)) {
            out[newKey] = out[oldKey];
        }
    }
    return out;
}

function classEntryLabel(entry: ClassEntry | null | undefined): string {
    if (!entry) return '';
    const shift = entry.shiftName ? ` \u2022 ${entry.shiftName}` : '';
    return `${entry.class}${shift}`;
}

function divisionsFromCount(numDivisions: number | undefined): string[] {
    const n = Math.max(1, Number(numDivisions) || 1);
    return Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
}

function downloadTextFile(filename: string, contents: string, mime: string = 'text/plain'): void {
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

function escapeHtml(v: unknown): string {
    return String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function formatNow(): string {
    try {
        return new Date().toLocaleString('en-IN');
    } catch {
        return new Date().toISOString();
    }
}

function groupAssignments(assignments: Assignment[] = []): string {
    const grouped = new Map<string, Set<string>>();
    for (const a of assignments || []) {
        const cls = (a?.className || '').toString().trim();
        const shift = (a?.shiftName || '').toString().trim();
        if (!cls) continue;
        const key = `${cls}|||${shift}`;
        const div = (a?.division || '').toString().trim().toUpperCase();
        if (!grouped.has(key)) grouped.set(key, new Set());
        if (div) grouped.get(key)!.add(div);
    }

    const parts: string[] = [];
    for (const [key, divs] of grouped.entries()) {
        const [cls, shift] = key.split('|||');
        const divList = Array.from(divs).sort();
        const divLabel = divList.length ? ` (${divList.join(', ')})` : '';
        const shiftLabel = shift ? ` \u2022 ${shift}` : '';
        parts.push(`${cls}${shiftLabel}${divLabel}`);
    }
    return parts.join(' \u2022 ') || '-';
}

export default function ElectronStaffClient({
    staff = [],
    classEntries = [],
    branches = [],
    academicYearId,
    branchId,
    branchName = '',
    yearName = '',
}: ElectronStaffClientProps) {
    const router = useRouter();
    const [message, setMessage] = useState<Message | null>(null);
    const [query, setQuery] = useState('');
    const apiRef = useGridApiRef();

    const [addOpen, setAddOpen] = useState(false);
    const [editRow, setEditRow] = useState<StaffRow | null>(null);
    const [deleteRow, setDeleteRow] = useState<StaffRow | null>(null);

    const [reportOpen, setReportOpen] = useState(false);
    const [reportTeacherId, setReportTeacherId] = useState('');
    const [reportClassKey, setReportClassKey] = useState('');
    const [reportDivision, setReportDivision] = useState('');
    const [reportRows, setReportRows] = useState<StudentRow[]>([]);
    const [reportLoading, setReportLoading] = useState(false);

    const [columnVisibility, setColumnVisibility] = useState<GridColumnVisibilityModel>(DEFAULT_COLUMN_VISIBILITY);
    const persistTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastQueuedVisibilityRef = useRef(JSON.stringify(DEFAULT_COLUMN_VISIBILITY));
    const lastSavedVisibilityRef = useRef(JSON.stringify(DEFAULT_COLUMN_VISIBILITY));

    useEffect(() => {
        (async () => {
            try {
                const saved = await getUiSetting('staffTableSettings');
                const model = normalizeStaffColumnsModel((saved as { columnVisibilityModel?: unknown })?.columnVisibilityModel);
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

    const fetchStaffSearch = useCallback(async (q: string) => {
        const res = await getStaff({ search: q, limit: 500 });
        return Array.isArray(res) ? res : [];
    }, []);

    const { active: searchActive, searching, results: searchResults } = useAsyncSearch<StaffMember>({
        query,
        minChars: 2,
        debounceMs: 300,
        fetcher: fetchStaffSearch,
    });

    const baseStaff = useMemo(() => {
        return searchActive ? searchResults : staff;
    }, [searchActive, searchResults, staff]);

    const teachers = useMemo(() => (baseStaff || []).filter((s) => s.staffType === 'teacher'), [baseStaff]);
    const teacherOptions = useMemo<SearchableSelectOption[]>(
        () =>
            (teachers || []).map((t) => ({
                value: String(t._id),
                label: t.name || '',
                keywords: t.name || '',
            })),
        [teachers]
    );

    const staffRows: StaffRow[] = useMemo(() => {
        const q = String(query || '').trim().toLowerCase();
        const base = (baseStaff || []).map((s, idx) => ({
            ...s,
            srNo: idx + 1,
        }));
        if (searchActive || !q) return base;
        return base.filter((s) => (
            String(s.name || '').toLowerCase().includes(q) ||
            String(s.contact || '').toLowerCase().includes(q) ||
            String(s.role || '').toLowerCase().includes(q)
        ));
    }, [baseStaff, query, searchActive]);

    useEffect(() => {
        if (staffRows.length > 0) {
            const timeout = setTimeout(() => {
                apiRef.current.autosizeColumns({
                    includeHeaders: true,
                    columns: ['srNo'],
                    includeOutliers: true,
                });
            }, 100);
            return () => clearTimeout(timeout);
        }
    }, [staffRows, apiRef]);

    const buildTeacherReportHtml = useMemo(() => {
        return (rows: StudentRow[], { teacherName }: { teacherName?: string } = {}) => {
            const now = formatNow();
            const htmlRows = (rows || [])
                .map((r, idx) => {
                    const row = {
                        srNo: idx + 1,
                        name: r.name || '',
                        parents_contact1: r.parentContact1 || '',
                        parents_contact2: r.parentContact2 || '',
                        class_display: `${r.className || ''}${r.section ? ` (${r.section})` : ''}${r.shiftName ? ` \u2022 ${r.shiftName}` : ''}`,
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
    <div class="meta">${escapeHtml(now)} \u2022 Total: ${(rows || []).length}</div>
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
        const seen = new Map<string, { key: string; className: string; shiftName: string; label: string }>();
        for (const a of selectedTeacher.assignments) {
            const cls = (a?.className || '').toString().trim();
            const shift = (a?.shiftName || '').toString().trim();
            if (!cls) continue;
            const key = `${cls}|||${shift}`;
            if (!seen.has(key)) {
                seen.set(key, { key, className: cls, shiftName: shift, label: `${cls}${shift ? ` \u2022 ${shift}` : ''}` });
            }
        }
        return Array.from(seen.values()).sort((x, y) => x.label.localeCompare(y.label));
    }, [selectedTeacher]);

    const availableDivisions = useMemo(() => {
        if (!selectedTeacher?.assignments?.length) return [];
        if (!reportClassKey) return [];
        const [cls, shift] = reportClassKey.split('|||');
        const divs = new Set<string>();
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
                setMessage({ type: 'error', text: (e as Error)?.message || 'Failed to load report' });
            } finally {
                setReportLoading(false);
            }
        };
        run();
    }, [reportOpen, reportTeacherId, reportClassKey, reportDivision, academicYearId, branchId]);

    const columns: GridColDef[] = useMemo(() => {
        return [
            {
                field: 'srNo',
                headerName: 'Sr No',
                sortable: false,
                filterable: false,
                disableColumnMenu: true,
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
                renderCell: (params: GridRenderCellParams) => {
                    const type = params.value as string;
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
                renderCell: (params: GridRenderCellParams) => {
                    if ((params.row as StaffRow)?.staffType !== 'teacher') return <span style={{ color: '#999' }}>-</span>;
                    const full = groupAssignments((params.row as StaffRow)?.assignments || []);
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
                renderCell: (params: GridRenderCellParams) => (
                    <Tooltip title={params.value || ''}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{params.value || ''}</span>
                    </Tooltip>
                ),
            },
            {
                field: '__actions',
                headerName: 'Actions',
                width: 140,
                sortable: false,
                filterable: false,
                hideable: false,
                headerAlign: 'center',
                align: 'center',
                renderCell: (params: GridRenderCellParams) => (
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', height: '100%', justifyContent: 'center' }}>
                        <Tooltip title="Edit">
                            <IconButton
                                size="small"
                                onClick={() => setEditRow(params.row as StaffRow)}
                            >
                                <EditIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                            <IconButton
                                size="small"
                                color="error"
                                onClick={() => setDeleteRow(params.row as StaffRow)}
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
        const fileName = `staff-${branchName || 'all'}-${yearName || ''}`.trim().replace(/\s+/g, '-');
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
                    {searching && <Chip size="small" label="Searching..." />}
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
                    <Typography variant="h4" fontWeight="bold">Staff</Typography>
                    <Typography
                        variant="body2"
                        color="text.secondary"
                        noWrap
                        sx={{ minWidth: 0, maxWidth: '100%' }}
                    >
                        Staff directory{branchName ? ` \u2022 ${branchName}` : ''}{yearName ? ` \u2022 ${yearName}` : ''}
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
                        color="secondary"
                        onClick={() => {
                            setReportTeacherId('');
                            setReportClassKey('');
                            setReportDivision('');
                            setReportRows([]);
                            setReportOpen(true);
                        }}
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
                        Add Staff
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
                    id="staff-search"
                    value={query}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                    placeholder="Search by name, contact, role..."
                    label="Search"
                    size="small"
                    sx={{ width: '100%', maxWidth: '100%' }}
                    slotProps={{
                        input: {
                            endAdornment: searching ? <CircularProgress size={18} /> : undefined,
                        },
                    }}
                />
            </Paper>

            <StandardDataGrid
                apiRef={apiRef}
                rows={staffRows}
                columns={columns}
                getRowId={(row) => row._id}
                autoHeight
                loading={searching}
                pageSizeOptions={[10]}
                initialState={{
                    pagination: { paginationModel: { pageSize: 10, page: 0 } },
                    sorting: { sortModel: [{ field: 'srNo', sort: 'asc' }] },
                }}
                columnVisibilityModel={columnVisibility}
                onColumnVisibilityModelChange={queuePersistColumns}
                slots={{ toolbar: GridToolbar }}
            />

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
                            const res = await deleteStaff(deleteRow!._id);
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
                                    {formatNow()} \u2022 Total: {reportRows.length}
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
                        {reportClassKey && <Chip size="small" label={`Class: ${reportClassKey.replace('|||', ' \u2022 ')}`} />}
                        {reportDivision && <Chip size="small" label={`Division: ${reportDivision}`} />}
                    </Stack>
                    <Divider sx={{ mb: 2 }} />

	                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }} alignItems={{ xs: 'stretch', sm: 'center' }}>
	                        <Box sx={{ minWidth: 220 }}>
	                            <SearchableSelect
	                                label="Teacher"
	                                placeholder="Type to search"
	                                value={reportTeacherId}
	                                onChange={(next) => {
	                                    setReportTeacherId(next);
	                                    setReportClassKey('');
	                                    setReportDivision('');
	                                }}
	                                options={teacherOptions}
	                                listboxMaxHeight={360}
	                            />
	                        </Box>

                        <FormControl size="small" sx={{ minWidth: 220 }} disabled={!reportTeacherId}>
                            <InputLabel>Class</InputLabel>
                            <Select
                                label="Class"
                                value={reportClassKey}
                                onChange={(e: SelectChangeEvent) => {
                                    setReportClassKey(e.target.value);
                                    setReportDivision('');
                                }}
                                renderValue={(selected) => selected ? selected.replace('|||', ' \u2022 ') : 'All Classes'}
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
                                onChange={(e: SelectChangeEvent) => setReportDivision(e.target.value)}
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
                            sx={{ ml: { sm: 'auto' } }}
                        >
                            Reset
                        </Button>
                    </Stack>

                    <Paper sx={{ p: 1 }}>
                        <BareDataGrid
                            rows={reportRows.map((r, idx) => ({ ...r, srNo: idx + 1 }))}
                            getRowId={(row) => row._id || `${row.name}-${row.rollNumber}-${row.className}-${row.section}`}
                            columns={[
                                { field: 'srNo', headerName: 'Sr No', width: 90, align: 'center', headerAlign: 'center', disableColumnMenu: true },
                                { field: 'name', headerName: 'Name', flex: 1, minWidth: 200 },
                                { field: 'parentContact1', headerName: 'Parent Contact 1', width: 170 },
                                { field: 'parentContact2', headerName: 'Parent Contact 2', width: 170 },
                                {
                                    field: 'classDisplay',
                                    headerName: 'Class',
                                    flex: 0.8,
                                    minWidth: 160,
                                    valueGetter: (_value, row) =>
                                        `${row?.className || ''}${row?.section ? ` (${row.section})` : ''}${row?.shiftName ? ` \u2022 ${row.shiftName}` : ''}`,
                                },
                            ]}
                            autoHeight
                            disableRowSelectionOnClick
                            disableVirtualization
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

interface AssignmentUi {
    classEntryId: string;
    classKey: string;
    divisions: string[];
}

interface StaffDialogProps {
    mode: 'add' | 'edit';
    open: boolean;
    onClose: () => void;
    branchId: string;
    classEntries: ClassEntry[];
    branches: Branch[];
    initial?: StaffRow | null;
    onDone?: (res: { error?: string; success?: boolean }) => void;
}

function StaffDialog({ mode, open, onClose, branchId, classEntries, branches, initial, onDone }: StaffDialogProps) {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const [staffType, setStaffType] = useState(initial?.staffType || 'office');
    const [assignmentsUi, setAssignmentsUi] = useState<AssignmentUi[]>(() => {
        // UI shape: [{ classEntryId, classKey, divisions: [] }]
        // Prefer stable FeeStructure id when available; fall back to classKey for legacy data.
        const out: AssignmentUi[] = [];
        const grouped = new Map<string, { classEntryId: string; classKey: string; divs: Set<string> }>();
        const entries = Array.isArray(classEntries) ? classEntries : [];

        const resolveId = (cls: string, shift: string): string => {
            const matchInBranch = entries.find(
                (ce) =>
                    String(ce.branchId || '') === String(branchId || '') &&
                    String(ce.class || '') === String(cls || '') &&
                    String(ce.shiftName || '') === String(shift || '')
            );
            const matchAny = entries.find(
                (ce) => String(ce.class || '') === String(cls || '') && String(ce.shiftName || '') === String(shift || '')
            );
            return (matchInBranch || matchAny)?._id ? String((matchInBranch || matchAny)!._id) : '';
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
            if (div) grouped.get(groupKey)!.divs.add(div);
        }

        for (const info of grouped.values()) {
            out.push({ classEntryId: info.classEntryId, classKey: info.classKey, divisions: Array.from(info.divs) });
        }
        return out.length ? out : [{ classEntryId: '', classKey: '', divisions: [] }];
    });

    const branchNameById = useMemo(() => {
        const map = new Map<string, string>();
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
        const resolveId = (cls: string, shift: string): string => {
            const matchInBranch = entries.find(
                (ce) =>
                    String(ce.branchId || '') === String(branchId || '') &&
                    String(ce.class || '') === String(cls || '') &&
                    String(ce.shiftName || '') === String(shift || '')
            );
            const matchAny = entries.find(
                (ce) => String(ce.class || '') === String(cls || '') && String(ce.shiftName || '') === String(shift || '')
            );
            return (matchInBranch || matchAny)?._id ? String((matchInBranch || matchAny)!._id) : '';
        };

        const grouped = new Map<string, { classEntryId: string; classKey: string; divs: Set<string> }>();
        for (const a of initial.assignments) {
            const cls = (a?.className || '').toString();
            const shift = (a?.shiftName || '').toString();
            if (!cls) continue;
            const classKey = `${cls}|||${shift}`;
            const id = a?.classEntryId ? String(a.classEntryId) : resolveId(cls, shift);
            const groupKey = id ? `id:${id}` : `legacy:${classKey}`;
            if (!grouped.has(groupKey)) grouped.set(groupKey, { classEntryId: id, classKey, divs: new Set() });
            const div = (a?.division || '').toString().trim().toUpperCase();
            if (div) grouped.get(groupKey)!.divs.add(div);
        }

        const nextUi = Array.from(grouped.values()).map((info) => ({
            classEntryId: info.classEntryId,
            classKey: info.classKey,
            divisions: Array.from(info.divs),
        }));
        setAssignmentsUi(nextUi.length ? nextUi : [{ classEntryId: '', classKey: '', divisions: [] }]);
    }, [open, initial?._id, initial?.staffType, initial?.assignments, branchId, classEntries]);

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');

        const formData = new FormData(e.currentTarget);
        formData.set('branchId', branchId || '');
        formData.set('staffType', staffType);

        const classEntryById = new Map<string, ClassEntry>();
        for (const ce of classEntries || []) classEntryById.set(String(ce._id), ce);

        // Convert UI assignments -> backend shape [{ classEntryId, branchId, className, shiftName, division }]
        if (staffType === 'teacher') {
            const assignments: Assignment[] = [];
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
                    ? await updateStaff(initial!._id, formData)
                    : await createStaff(formData);
            if (res?.error) {
                setError(res.error);
                onDone?.(res);
                return;
            }
            onDone?.({ success: true });
        } catch (err) {
            const msg = (err as Error)?.message || 'Failed to save staff';
            setError(msg);
            onDone?.({ error: msg });
        } finally {
            setSubmitting(false);
        }
    };

    const rowDivisions = (row: AssignmentUi | null): string[] => {
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
            const prefix = bName ? `${bName} \u2022 ` : '';
            return { id: String(ce._id), label: `${prefix}${classEntryLabel(ce)}` };
        });

        // Add legacy options if there are assignments we couldn't resolve.
        const legacy: { id: string; label: string }[] = [];
        for (const row of assignmentsUi || []) {
            if (row?.classEntryId) continue;
            const key = String(row?.classKey || '').trim();
            if (!key) continue;
            const [cls, shift] = key.split('|||');
            const display = `${cls}${shift ? ` \u2022 ${shift}` : ''} (Legacy)`;
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
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField name="name" label="Name" fullWidth required defaultValue={initial?.name || ''} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField name="contact" label="Contact" fullWidth defaultValue={initial?.contact || ''} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField name="email" label="Email" fullWidth defaultValue={initial?.email || ''} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField name="role" label="Role" fullWidth defaultValue={initial?.role || ''} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                select
                                label="Staff Type"
                                fullWidth
                                value={staffType}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setStaffType(e.target.value)}
                            >
                                <MenuItem value="office">Office Staff</MenuItem>
                                <MenuItem value="teacher">Teacher</MenuItem>
                            </TextField>
                        </Grid>

                        {staffType === 'teacher' && (
                            <Grid size={{ xs: 12 }}>
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
                                                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
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
                                                    SelectProps={{ multiple: true, renderValue: (sel) => ((sel as string[])?.length ? (sel as string[]).join(', ') : 'All') }}
                                                    value={row.divisions || []}
                                                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                                        const next = [...assignmentsUi];
                                                        next[idx] = { ...next[idx], divisions: e.target.value as unknown as string[] };
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
                                        startIcon={<AddIcon />}
                                        onClick={() => setAssignmentsUi([...assignmentsUi, { classEntryId: '', classKey: '', divisions: [] }])}
                                        sx={{ mt: 1 }}
                                    >
                                        Add Assignment
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
