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
    IconButton,
    Tooltip,
    Chip,
    DialogContentText,
    Stack,
    Divider,
    FormControl,
    InputLabel,
    Select,
    SelectChangeEvent,
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Visibility as VisibilityIcon,
    Print as PrintIcon,
    Person as PersonIcon,
    Phone as PhoneIcon,
    School as SchoolIcon,
    Badge as BadgeIcon,
    Wc as WcIcon,
    LocationOn as LocationOnIcon,
    CalendarToday as CalendarTodayIcon,
    CurrencyRupee as CurrencyRupeeIcon,
} from '@mui/icons-material';
import { Download as DownloadIcon } from '@mui/icons-material';
import { teal } from '@mui/material/colors';
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
import { admitStudent, deleteStudent, getNextRollNumber, getStudentDirectory, updateAdmittedStudent } from '@/app/actions/student';
import { getUiSetting, setUiSetting } from '@/app/actions/uiSettings';
import StandardDataGrid from '@/components/StandardDataGrid';
import BareDataGrid from '@/components/BareDataGrid';
import useAsyncSearch from '@/components/ui/search/useAsyncSearch';

interface ClassEntry {
    _id: string;
    class: string;
    shiftName?: string;
    numDivisions?: number;
}

interface StudentRow {
    _id: string;
    name?: string;
    rollNumber?: string;
    className?: string;
    section?: string;
    shiftName?: string;
    gender?: string;
    parentContact1?: string;
    parentContact2?: string;
    fatherName?: string;
    motherName?: string;
    feeScholarship?: number;
    birthPlace?: string;
    religion?: string;
    admissionDate?: string;
    address?: string;
    srNo?: number;
}

interface Message {
    type: 'success' | 'error' | 'info' | 'warning';
    text: string;
}

interface ElectronStudentsClientProps {
    students?: StudentRow[];
    academicYearId: string;
    branchId: string;
    classEntries?: ClassEntry[];
    branchName?: string;
    yearName?: string;
}

const DEFAULT_COLUMN_VISIBILITY: GridColumnVisibilityModel = {
    srNo: true,
    roll_number: true,
    class_name: true,
    branch_name: false,
    parents_contact1: false,
    parents_contact2: false,
    gender: false,
    mother_name: false,
    father_name: false,
    fee_scholarship: false,
    birth_place: false,
    religion: false,
    admission_date: false,
    address: true,
};

function normalizeStudentColumnsModel(model: unknown): GridColumnVisibilityModel | null {
    if (!model || typeof model !== 'object') return null;
    const map: Record<string, string> = {
        rollNumber: 'roll_number',
        className: 'class_name',
        parentContact1: 'parents_contact1',
        parentContact2: 'parents_contact2',
        feeScholarship: 'fee_scholarship',
        admissionDate: 'admission_date',
        branchName: 'branch_name',
        motherName: 'mother_name',
        fatherName: 'father_name',
        birthPlace: 'birth_place',
    };
    const out = { ...(model as Record<string, boolean>) };
    for (const [oldKey, newKey] of Object.entries(map)) {
        if (Object.prototype.hasOwnProperty.call(out, oldKey) && !Object.prototype.hasOwnProperty.call(out, newKey)) {
            out[newKey] = out[oldKey];
        }
    }
    return out;
}

function todayDateOnly(): string {
    return new Date().toISOString().split('T')[0];
}

function divisionsFromCount(numDivisions: number | undefined): string[] {
    const n = Math.max(1, Number(numDivisions) || 1);
    return Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
}

function classEntryLabel(entry: ClassEntry | null | undefined): string {
    if (!entry) return '';
    const shift = entry.shiftName ? ` \u2022 ${entry.shiftName}` : '';
    return `${entry.class}${shift}`;
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

export default function ElectronStudentsClient({
    students = [],
    academicYearId,
    branchId,
    classEntries = [],
    branchName = '',
    yearName = '',
}: ElectronStudentsClientProps) {
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [message, setMessage] = useState<Message | null>(null);
    const apiRef = useGridApiRef();

    const [addOpen, setAddOpen] = useState(false);
    const [editRow, setEditRow] = useState<StudentRow | null>(null);
    const [viewRow, setViewRow] = useState<StudentRow | null>(null);
    const [deleteRow, setDeleteRow] = useState<StudentRow | null>(null);

    const [reportOpen, setReportOpen] = useState(false);
    const [reportClassId, setReportClassId] = useState('');
    const [reportDivision, setReportDivision] = useState('');
    const [reportGender, setReportGender] = useState('');

    const [columnVisibility, setColumnVisibility] = useState<GridColumnVisibilityModel>(DEFAULT_COLUMN_VISIBILITY);
    const persistTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastQueuedVisibilityRef = useRef(JSON.stringify(DEFAULT_COLUMN_VISIBILITY));
    const lastSavedVisibilityRef = useRef(JSON.stringify(DEFAULT_COLUMN_VISIBILITY));

    useEffect(() => {
        (async () => {
            try {
                const saved = await getUiSetting('studentsTableSettings');
                const model = normalizeStudentColumnsModel((saved as { columnVisibilityModel?: unknown })?.columnVisibilityModel);
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

    const fetchStudentSearch = useCallback(
        async (q: string) => {
            const res = await getStudentDirectory({ academicYearId, branchId, search: q });
            return Array.isArray(res) ? res : [];
        },
        [academicYearId, branchId]
    );

    const { active: searchActive, searching, results: searchResults } = useAsyncSearch<StudentRow>({
        query,
        minChars: 2,
        debounceMs: 300,
        fetcher: fetchStudentSearch,
    });

    const baseStudents = useMemo(() => {
        return searchActive ? searchResults : students;
    }, [searchActive, searchResults, students]);

    const filtered = useMemo(() => {
        const q = String(query || '').trim().toLowerCase();
        if (searchActive || !q) return baseStudents;
        return (baseStudents || []).filter((s) => (
            String(s.name || '').toLowerCase().includes(q) ||
            String(s.rollNumber || '').toLowerCase().includes(q) ||
            String(s.className || '').toLowerCase().includes(q) ||
            String(s.section || '').toLowerCase().includes(q) ||
            String(s.parentContact1 || '').toLowerCase().includes(q)
        ));
    }, [baseStudents, query, searchActive]);

    useEffect(() => {
        if (filtered.length > 0) {
            const timeout = setTimeout(() => {
                apiRef.current.autosizeColumns({
                    includeHeaders: true,
                    columns: ['srNo', 'name'],
                    includeOutliers: true,
                });
            }, 100);
            return () => clearTimeout(timeout);
        }
    }, [filtered, apiRef]);

    const queuePersistColumns = (next: GridColumnVisibilityModel) => {
        setColumnVisibility(next);
        const json = JSON.stringify(next);
        lastQueuedVisibilityRef.current = json;

        if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        persistTimerRef.current = setTimeout(async () => {
            if (lastSavedVisibilityRef.current === json) return;
            if (lastQueuedVisibilityRef.current !== json) return;
            try {
                await setUiSetting('studentsTableSettings', { columnVisibilityModel: next }, 'general');
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

    const buildReportHtml = (rows: StudentRow[]) => {
        const reportRows = (rows || []).map((r, idx) => ({
            srNo: idx + 1,
            name: r.name || '',
            parents_contact1: r.parentContact1 || '',
            parents_contact2: r.parentContact2 || '',
            class_display: `${r.className || ''}${r.section ? ` (${r.section})` : ''}${r.shiftName ? ` \u2022 ${r.shiftName}` : ''}`,
        }));

        const columns = [
            { key: 'srNo', title: 'Sr No' },
            { key: 'name', title: 'Student Name' },
            { key: 'parents_contact1', title: "Father's Contact" },
            { key: 'parents_contact2', title: "Mother's Contact" },
            { key: 'class_display', title: 'Class' },
        ];

        const escape = (v: unknown) =>
            String(v ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');

        const htmlRows = reportRows
            .map((r) => `<tr>${columns.map((c) => `<td>${escape(r[c.key as keyof typeof r])}</td>`).join('')}</tr>`)
            .join('');

        const now = new Date().toLocaleString('en-IN');
        return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Student Report</title>
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
    <div class="branch">${escape(branchName || 'Branch')}</div>
    <div class="subject">Student Report</div>
    <div class="meta">${escape(now)} \u2022 Total: ${reportRows.length}</div>
    <div>
      <span class="chip">Year: ${escape(yearName || '')}</span>
    </div>
  </div>
  <table>
    <thead><tr>${columns.map((c) => `<th>${escape(c.title)}</th>`).join('')}</tr></thead>
    <tbody>${htmlRows}</tbody>
  </table>
</body>
</html>`;
    };

    const classes = useMemo(() => {
        return (classEntries || []).map((entry) => ({
            id: entry._id,
            class: entry.class,
            shiftName: entry.shiftName || '',
            displayName: entry.class ? `${entry.class}${entry.shiftName ? ` - ${entry.shiftName}` : ''}` : '',
            numDivisions: entry.numDivisions || 1,
        }));
    }, [classEntries]);

    const availableDivisions = useMemo(() => {
        if (!reportClassId) return [];
        const selected = (classes || []).find((c) => String(c.id) === String(reportClassId));
        return selected ? divisionsFromCount(selected.numDivisions || 1) : [];
    }, [reportClassId, classes]);

    const reportFiltered = useMemo(() => {
        let list = students || [];
        const selected = reportClassId ? (classes || []).find((c) => String(c.id) === String(reportClassId)) : null;

        if (selected) {
            list = list.filter((s) => String(s.className || '') === String(selected.class || '') && String(s.shiftName || '') === String(selected.shiftName || ''));
        }
        if (reportDivision) {
            list = list.filter((s) => String(s.section || '').toUpperCase() === String(reportDivision).toUpperCase());
        }
        if (reportGender) {
            list = list.filter((s) => String(s.gender || '').toLowerCase() === String(reportGender).toLowerCase());
        }

        return list.map((item, index) => {
            const class_display = `${item.className || ''}${item.shiftName ? ` - ${item.shiftName}` : ''}${item.section ? ` (${item.section})` : ''}`;
            return { ...item, srNo: index + 1, class_display };
        });
    }, [students, classes, reportClassId, reportDivision, reportGender]);

    const reportClassLabel = useMemo(() => {
        if (!reportClassId) return 'All';
        const c = (classes || []).find((x) => String(x.id) === String(reportClassId));
        return c?.displayName || String(reportClassId);
    }, [reportClassId, classes]);

    const reportDivisionLabel = useMemo(() => (reportDivision ? String(reportDivision) : 'All'), [reportDivision]);
    const reportGenderLabel = useMemo(() => {
        if (!reportGender) return 'All';
        const s = String(reportGender);
        return s.charAt(0).toUpperCase() + s.slice(1);
    }, [reportGender]);

    const reportCount = reportFiltered.length;
    const reportGeneratedAt = useMemo(() => {
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
    }, []);

    const reportColumns: GridColDef[] = useMemo(
        () => [
            { field: 'srNo', headerName: 'Sr No', width: 90, headerAlign: 'center', align: 'center', disableColumnMenu: true },
            { field: 'name', headerName: 'Student Name', flex: 1, minWidth: 160 },
            { field: 'parentContact1', headerName: "Father's Contact", flex: 0.8, minWidth: 140 },
            { field: 'parentContact2', headerName: "Mother's Contact", flex: 0.8, minWidth: 140 },
            { field: 'class_display', headerName: 'Class', flex: 0.8, minWidth: 120 },
        ],
        []
    );

    const buildStudentReportHtml = useMemo(() => {
        return (rows: StudentRow[]) => {
            const columns = [
                { key: 'srNo', title: 'Sr No' },
                { key: 'name', title: 'Student Name' },
                { key: 'parents_contact1', title: "Father's Contact" },
                { key: 'parents_contact2', title: "Mother's Contact" },
                { key: 'class_display', title: 'Class' },
            ];

            const htmlRows = (rows || [])
                .map((r, idx) => {
                    const row = {
                        srNo: idx + 1,
                        name: r.name || '',
                        parents_contact1: r.parentContact1 || '',
                        parents_contact2: r.parentContact2 || '',
                        class_display: (r as StudentRow & { class_display?: string }).class_display || '',
                    };
                    return `<tr>${columns.map((c) => `<td>${escapeHtml(row[c.key as keyof typeof row])}</td>`).join('')}</tr>`;
                })
                .join('');

            return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Student Report</title>
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
    @media print { @page { size: A4; margin: 12mm; } thead { display: table-header-group; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="branch">${escapeHtml(branchName || 'Branch')}</div>
    <div class="subject">Student Report</div>
    <div class="meta">${escapeHtml(reportGeneratedAt)} \u2022 Total: ${(rows || []).length}</div>
    <div>
      <span class="chip">Year: ${escapeHtml(yearName || '')}</span>
      <span class="chip">Class: ${escapeHtml(reportClassLabel)}</span>
      <span class="chip">Division: ${escapeHtml(reportDivisionLabel)}</span>
      <span class="chip">Gender: ${escapeHtml(reportGenderLabel)}</span>
    </div>
  </div>
  <table>
    <thead><tr>${columns.map((c) => `<th>${escapeHtml(c.title)}</th>`).join('')}</tr></thead>
    <tbody>${htmlRows}</tbody>
  </table>
</body>
</html>`;
        };
    }, [branchName, yearName, reportGeneratedAt, reportClassLabel, reportDivisionLabel, reportGenderLabel]);

    const printStudentReport = () => {
        const html = buildStudentReportHtml(reportFiltered);
        const w = window.open('', '_blank');
        if (!w) return;
        w.document.open();
        w.document.write(html.replace('</body>', '<script>window.onload=function(){window.print();}</script></body>'));
        w.document.close();
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
                valueGetter: (_value, row) => row?.name || '',
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
                    <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', justifyContent: 'center', width: '100%' }}>
                        <BadgeIcon sx={{ mr: 1, color: teal[700], fontSize: 18 }} />
                        <Tooltip title={params.value || ''}>
                            <span>{params.value || ''}</span>
                        </Tooltip>
                    </Box>
                ),
            },
            {
                field: 'class_name',
                headerName: 'Class',
                flex: 0.8,
                minWidth: 120,
                headerAlign: 'center',
                align: 'center',
                valueGetter: (_value, row) => `${row?.className || ''}${row?.shiftName ? ` - ${row.shiftName}` : ''}${row?.section ? ` (${row.section})` : ''}`,
                renderCell: (params: GridRenderCellParams) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', justifyContent: 'center', width: '100%' }}>
                        <SchoolIcon sx={{ mr: 1, color: teal[700], fontSize: 18 }} />
                        <Tooltip title={params.value || ''}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{params.value || ''}</span>
                        </Tooltip>
                    </Box>
                ),
            },
            {
                field: 'branch_name',
                headerName: 'Branch',
                flex: 0.9,
                minWidth: 140,
                valueGetter: () => branchName || '',
                renderCell: (params: GridRenderCellParams) => (
                    <Tooltip title={params.value || ''}>
                        <span>{params.value || ''}</span>
                    </Tooltip>
                ),
            },
            {
                field: 'parents_contact1',
                headerName: `Father's Contact`,
                flex: 0.8,
                minWidth: 150,
                valueGetter: (_value, row) => row?.parentContact1 || '',
                renderCell: (params: GridRenderCellParams) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                        <PhoneIcon sx={{ mr: 1, color: teal[700], fontSize: 18 }} />
                        <Tooltip title={params.value || ''}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                                {params.value || ''}
                            </span>
                        </Tooltip>
                    </Box>
                ),
            },
            {
                field: 'parents_contact2',
                headerName: `Mother's Contact`,
                flex: 0.8,
                minWidth: 150,
                valueGetter: (_value, row) => row?.parentContact2 || '',
                renderCell: (params: GridRenderCellParams) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                        <PhoneIcon sx={{ mr: 1, color: teal[700], fontSize: 18 }} />
                        <Tooltip title={params.value || ''}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                                {params.value || ''}
                            </span>
                        </Tooltip>
                    </Box>
                ),
            },
            {
                field: 'gender',
                headerName: 'Gender',
                flex: 0.6,
                minWidth: 110,
                headerAlign: 'center',
                align: 'center',
                valueGetter: (_value, row) => row?.gender || '',
                renderCell: (params: GridRenderCellParams) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', justifyContent: 'center', width: '100%' }}>
                        <WcIcon sx={{ mr: 1, color: teal[700], fontSize: 18 }} />
                        <Tooltip title={params.value || ''}>
                            <span>{params.value || ''}</span>
                        </Tooltip>
                    </Box>
                ),
            },
            { field: 'mother_name', headerName: 'Mother Name', flex: 0.8, minWidth: 140, valueGetter: (_value, row) => row?.motherName || '' },
            { field: 'father_name', headerName: 'Father Name', flex: 0.8, minWidth: 140, valueGetter: (_value, row) => row?.fatherName || '' },
            {
                field: 'fee_scholarship',
                headerName: 'Fee Scholarship',
                flex: 0.7,
                minWidth: 130,
                headerAlign: 'center',
                align: 'center',
                valueFormatter: (v) => {
                    const n = Number((v as { value?: unknown })?.value ?? v) || 0;
                    return n ? `\u20B9${n.toLocaleString('en-IN')}` : '-';
                },
                valueGetter: (_value, row) => Number(row?.feeScholarship) || 0,
                renderCell: (params: GridRenderCellParams) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', justifyContent: 'center', width: '100%' }}>
                        <CurrencyRupeeIcon sx={{ mr: 1, color: teal[700], fontSize: 18 }} />
                        <Tooltip title={String(params.formattedValue || '')}>
                            <span style={{ fontWeight: 600 }}>{params.formattedValue || '-'}</span>
                        </Tooltip>
                    </Box>
                ),
            },
            {
                field: 'birth_place',
                headerName: 'Birth Place',
                flex: 0.7,
                minWidth: 120,
                valueGetter: (_value, row) => row?.birthPlace || '',
                renderCell: (params: GridRenderCellParams) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                        <LocationOnIcon sx={{ mr: 1, color: teal[700], fontSize: 18 }} />
                        <Tooltip title={params.value || ''}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                                {params.value || ''}
                            </span>
                        </Tooltip>
                    </Box>
                ),
            },
            { field: 'religion', headerName: 'Religion', flex: 0.6, minWidth: 100, valueGetter: (_value, row) => row?.religion || '' },
            {
                field: 'admission_date',
                headerName: 'Admission Date',
                flex: 0.8,
                minWidth: 140,
                valueGetter: (_value, row) => row?.admissionDate || '',
                renderCell: (params: GridRenderCellParams) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                        <CalendarTodayIcon sx={{ mr: 1, color: teal[700], fontSize: 18 }} />
                        <Tooltip title={params.value || ''}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                                {params.value || ''}
                            </span>
                        </Tooltip>
                    </Box>
                ),
            },
            {
                field: 'address',
                headerName: 'Address',
                flex: 1.2,
                minWidth: 180,
                valueGetter: (_value, row) => row?.address || '',
                renderCell: (params: GridRenderCellParams) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                        <LocationOnIcon sx={{ mr: 1, color: teal[700], fontSize: 18 }} />
                        <Tooltip title={params.value || ''}>
                            <span
                                style={{
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    maxWidth: 200,
                                }}
                            >
                                {params.value || ''}
                            </span>
                        </Tooltip>
                    </Box>
                ),
            },
            {
                field: 'actions',
                headerName: 'Actions',
                width: 160,
                sortable: false,
                filterable: false,
                headerAlign: 'center',
                align: 'center',
                renderCell: (params: GridRenderCellParams) => {
                    const row = params.row as StudentRow;
                    return (
                        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', height: '100%', justifyContent: 'center' }}>
                            <Tooltip title="Details">
                                <IconButton
                                    size="small"
                                    onClick={() => setViewRow(row)}
                                >
                                    <VisibilityIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Edit">
                                <IconButton
                                    size="small"
                                    onClick={() => setEditRow(row)}
                                >
                                    <EditIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete">
                                <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() => setDeleteRow(row)}
                                >
                                    <DeleteIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        </Box>
                    );
                },
            },
        ];
    }, [branchName]);

    function GridToolbar() {
        const fileName = `students-${branchName || 'branch'}-${yearName || ''}`.trim().replace(/\s+/g, '-');
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
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<DownloadIcon />}
                        onClick={() => downloadTextFile(`student-report-${Date.now()}.html`, buildReportHtml(filtered), 'text/html')}
                    >
                        Download HTML
                    </Button>
                    <Button variant="outlined" size="small" startIcon={<PrintIcon />} onClick={printReport}>
                        Print Report
                    </Button>
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
                    <Typography variant="h4" fontWeight="bold">Students</Typography>
                    <Typography
                        variant="body2"
                        color="text.secondary"
                        noWrap
                        sx={{ minWidth: 0, maxWidth: '100%' }}
                    >
                        Admission / Directory{branchName ? ` \u2022 ${branchName}` : ''}{yearName ? ` \u2022 ${yearName}` : ''}
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
                        onClick={() => setReportOpen(true)}
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
                        Add Student
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
	                    id="students-search"
	                    value={query}
	                    onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
	                    placeholder="Search by name, roll no, class, division, contact..."
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
	                rows={filtered}
	                columns={columns}
	                getRowId={(row) => row._id}
	                autoHeight
	                loading={searching}
	                stickyActionsField="actions"
	                pageSizeOptions={[10]}
                initialState={{
                    pagination: { paginationModel: { pageSize: 10, page: 0 } },
                    sorting: { sortModel: [{ field: 'srNo', sort: 'asc' }] },
                }}
                columnVisibilityModel={columnVisibility}
                onColumnVisibilityModelChange={(model) => {
                    queuePersistColumns(model);
                }}
                slots={{ toolbar: GridToolbar }}
            />

            <Dialog open={reportOpen} onClose={() => setReportOpen(false)} fullWidth maxWidth="lg">
                <DialogTitle sx={{ pb: 1 }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                            <Chip label="Report" color="primary" variant="outlined" />
                            <Box>
                                <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1 }}>
                                    Student Report
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                    {reportGeneratedAt} \u2022 Total: {reportCount}
                                </Typography>
                            </Box>
                        </Stack>
                    </Stack>
                </DialogTitle>
                <DialogContent dividers>
                    <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap' }}>
                        <Chip size="small" label={`Branch: ${branchName || '-'}`} />
                        <Chip size="small" label={`Year: ${yearName || '-'}`} />
                        <Chip size="small" label={`Class: ${reportClassLabel}`} />
                        <Chip size="small" label={`Division: ${reportDivisionLabel}`} />
                        <Chip size="small" label={`Gender: ${reportGenderLabel}`} />
                    </Stack>
                    <Divider sx={{ mb: 2 }} />

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
                        <FormControl size="small" sx={{ minWidth: 200 }}>
                            <InputLabel id="report-class-label" shrink={reportClassId === '' || reportClassId !== ''}>
                                Class
                            </InputLabel>
                            <Select
                                labelId="report-class-label"
                                label="Class"
                                value={reportClassId}
                                onChange={(e: SelectChangeEvent) => {
                                    setReportClassId(e.target.value);
                                    setReportDivision('');
                                }}
                                displayEmpty
                                renderValue={(selected) => {
                                    if (selected === '') return 'All';
                                    const c = (classes || []).find((x) => String(x.id) === String(selected));
                                    return c?.displayName || selected;
                                }}
                            >
                                <MenuItem value=""><em>All</em></MenuItem>
                                {classes.map((c) => (
                                    <MenuItem key={c.id} value={c.id}>{c.displayName}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <FormControl size="small" sx={{ minWidth: 120 }}>
                            <InputLabel id="report-division-label" shrink={reportDivision === '' || reportDivision !== ''}>
                                Division
                            </InputLabel>
                            <Select
                                labelId="report-division-label"
                                label="Division"
                                value={reportDivision}
                                onChange={(e: SelectChangeEvent) => setReportDivision(e.target.value)}
                                disabled={!reportClassId || availableDivisions.length === 0}
                                displayEmpty
                                renderValue={(selected) => (selected === '' ? 'All' : selected)}
                            >
                                <MenuItem value=""><em>All</em></MenuItem>
                                {availableDivisions.map((d) => (
                                    <MenuItem key={d} value={d}>{d}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <FormControl size="small" sx={{ minWidth: 120 }}>
                            <InputLabel id="report-gender-label" shrink={reportGender === '' || reportGender !== ''}>
                                Gender
                            </InputLabel>
                            <Select
                                labelId="report-gender-label"
                                label="Gender"
                                value={reportGender}
                                onChange={(e: SelectChangeEvent) => setReportGender(e.target.value)}
                                displayEmpty
                                renderValue={(selected) => (selected === '' ? 'All' : String(selected).charAt(0).toUpperCase() + String(selected).slice(1))}
                            >
                                <MenuItem value=""><em>All</em></MenuItem>
                                <MenuItem value="male">Male</MenuItem>
                                <MenuItem value="female">Female</MenuItem>
                                <MenuItem value="other">Other</MenuItem>
                            </Select>
                        </FormControl>

                        <Button
                            variant="text"
                            color="inherit"
                            onClick={() => {
                                setReportClassId('');
                                setReportDivision('');
                                setReportGender('');
                            }}
                            sx={{ ml: 'auto' }}
                        >
                            Reset
                        </Button>
                    </Stack>

                    <Typography variant="caption" sx={{ mb: 1, color: 'text.secondary' }}>
                        Showing {reportCount} result(s)
                    </Typography>
                    <div style={{ width: '100%', height: '60vh' }}>
                        <BareDataGrid
                            rows={reportFiltered}
                            getRowId={(row) => row._id}
                            columns={reportColumns}
                            disableRowSelectionOnClick
                            disableVirtualization
                            pageSizeOptions={[10]}
                            initialState={{
                                pagination: { paginationModel: { pageSize: 10, page: 0 } },
                                sorting: { sortModel: [{ field: 'name', sort: 'asc' }] },
                            }}
                        />
                    </div>
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="outlined"
                        startIcon={<DownloadIcon />}
                        onClick={() => downloadTextFile(`student-report-${Date.now()}.html`, buildStudentReportHtml(reportFiltered), 'text/html')}
                        disabled={reportCount === 0}
                    >
                        Download HTML
                    </Button>
                    <Button variant="contained" color="primary" onClick={printStudentReport} disabled={reportCount === 0}>
                        Print
                    </Button>
                    <Button onClick={() => setReportOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>

            <AddOrEditStudentDialog
                mode="add"
                open={addOpen}
                onClose={() => setAddOpen(false)}
                academicYearId={academicYearId}
                branchId={branchId}
                classEntries={classEntries}
                onDone={(res) => {
                    if (res?.error) setMessage({ type: 'error', text: res.error });
                    else setMessage({ type: 'success', text: 'Student added successfully.' });
                    setAddOpen(false);
                    router.refresh();
                }}
            />

            <AddOrEditStudentDialog
                mode="edit"
                open={!!editRow}
                onClose={() => setEditRow(null)}
                academicYearId={academicYearId}
                branchId={branchId}
                classEntries={classEntries}
                initial={editRow}
                onDone={(res) => {
                    if (res?.error) setMessage({ type: 'error', text: res.error });
                    else setMessage({ type: 'success', text: 'Student updated successfully.' });
                    setEditRow(null);
                    router.refresh();
                }}
            />

            <Dialog open={!!viewRow} onClose={() => setViewRow(null)} maxWidth="sm" fullWidth>
                <DialogTitle>Student Details</DialogTitle>
                <DialogContent dividers>
                    {viewRow && (
                        <Box sx={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 1.5 }}>
                            <Typography color="text.secondary">Name</Typography>
                            <Typography>{viewRow.name}</Typography>
                            <Typography color="text.secondary">Class</Typography>
                            <Typography>
                                {viewRow.className}
                                {viewRow.section ? ` (${viewRow.section})` : ''}
                                {viewRow.shiftName ? ` \u2022 ${viewRow.shiftName}` : ''}
                            </Typography>
                            <Typography color="text.secondary">Roll No</Typography>
                            <Typography>{viewRow.rollNumber || '-'}</Typography>
                            <Typography color="text.secondary">Admission Date</Typography>
                            <Typography>{viewRow.admissionDate || '-'}</Typography>
                            <Typography color="text.secondary">Gender</Typography>
                            <Typography>{viewRow.gender || '-'}</Typography>
                            <Typography color="text.secondary">Father Contact</Typography>
                            <Typography>{viewRow.parentContact1 || '-'}</Typography>
                            <Typography color="text.secondary">Mother Contact</Typography>
                            <Typography>{viewRow.parentContact2 || '-'}</Typography>
                            <Typography color="text.secondary">Scholarship</Typography>
                            <Typography>{viewRow.feeScholarship ? `\u20B9${Number(viewRow.feeScholarship).toLocaleString('en-IN')}` : '-'}</Typography>
                            <Typography color="text.secondary">Address</Typography>
                            <Typography>{viewRow.address || '-'}</Typography>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setViewRow(null)}>Close</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={!!deleteRow} onClose={() => setDeleteRow(null)}>
                <DialogTitle>Delete Student</DialogTitle>
                <DialogContent dividers>
                    <DialogContentText>
                        Delete <strong>{deleteRow?.name}</strong> (Roll: {deleteRow?.rollNumber})?
                        This will mark the student as inactive (the record is preserved for receipts/history).
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteRow(null)}>Cancel</Button>
                    <Button
                        color="error"
                        variant="contained"
                        onClick={async () => {
                            const res = await deleteStudent(deleteRow!._id);
                            if (res?.error) setMessage({ type: 'error', text: res.error });
                            else setMessage({ type: 'success', text: 'Student deleted.' });
                            setDeleteRow(null);
                            router.refresh();
                        }}
                    >
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

interface AddOrEditStudentDialogProps {
    mode: 'add' | 'edit';
    open: boolean;
    onClose: () => void;
    academicYearId: string;
    branchId: string;
    classEntries: ClassEntry[];
    initial?: StudentRow | null;
    onDone?: (res: { error?: string; success?: boolean }) => void;
}

function AddOrEditStudentDialog({ mode, open, onClose, academicYearId, branchId, classEntries, initial, onDone }: AddOrEditStudentDialogProps) {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const [classKey, setClassKey] = useState(initial ? `${initial.className}|||${initial.shiftName || ''}` : '');
    const [section, setSection] = useState(initial?.section || 'A');
    const [rollNumber, setRollNumber] = useState(initial?.rollNumber || '');

    // Sync dialog fields when switching rows or reopening.
    // (Without this, editing multiple rows in a row can show stale values.)
    useEffect(() => {
        if (!open) return;
        setError('');
        setSubmitting(false);
        setClassKey(initial ? `${initial.className}|||${initial.shiftName || ''}` : '');
        setSection(initial?.section || 'A');
        setRollNumber(initial?.rollNumber || '');
    }, [open, initial]);

    const selectedEntry = useMemo(() => {
        if (!classKey) return null;
        const [cls, shift] = classKey.split('|||');
        return (classEntries || []).find((e) => String(e.class) === String(cls) && String(e.shiftName || '') === String(shift || '')) || null;
    }, [classEntries, classKey]);

    const divisions = useMemo(() => divisionsFromCount(selectedEntry?.numDivisions || 1), [selectedEntry?.numDivisions]);

    const ensureRollNumber = async (nextClassKey: string, nextSection: string) => {
        const [cls, shift] = (nextClassKey || '').split('|||');
        if (!academicYearId || !cls || !nextSection) return;
        const res = await getNextRollNumber({
            academicYearId,
            className: cls,
            shiftName: shift || '',
            section: nextSection,
        });
        if (res?.next) setRollNumber(String(res.next));
    };

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');

        const formData = new FormData(e.currentTarget);

        // Normalize class/shift from the UI key
        const [cls, shift] = (classKey || '').split('|||');
        formData.set('class', cls || '');
        formData.set('shiftName', shift || '');
        formData.set('section', section || '');
        formData.set('rollNumber', rollNumber || '');
        formData.set('academicYearId', academicYearId);
        formData.set('branchId', branchId);

        try {
            const res =
                mode === 'edit'
                    ? await updateAdmittedStudent(initial!._id, formData)
                    : await admitStudent(formData);
            if (res?.error) {
                setError(res.error);
                onDone?.(res);
            } else {
                onDone?.({ success: true });
            }
        } catch (err) {
            const msg = (err as Error)?.message || 'Failed to save student';
            setError(msg);
            onDone?.({ error: msg });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>{mode === 'edit' ? 'Edit Student' : 'Add Student'}</DialogTitle>
            <Box component="form" onSubmit={handleSubmit}>
                <DialogContent dividers>
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12 }}>
                            <TextField
                                name="name"
                                label="Student Name"
                                fullWidth
                                required
                                defaultValue={initial?.name || ''}
                            />
                        </Grid>

                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                select
                                label="Class"
                                fullWidth
                                required
                                value={classKey}
                                onChange={async (e: ChangeEvent<HTMLInputElement>) => {
                                    const next = e.target.value;
                                    setClassKey(next);
                                    // When class changes, reset division/roll similar to Electron behavior.
                                    const nextSection = divisionsFromCount(
                                        (classEntries || []).find((ce) => classEntryLabel(ce) && `${ce.class}|||${ce.shiftName || ''}` === next)?.numDivisions || 1
                                    )[0] || 'A';
                                    setSection(nextSection);
                                    await ensureRollNumber(next, nextSection);
                                }}
                            >
                                <MenuItem value="">Select Class</MenuItem>
                                {(classEntries || []).map((ce) => (
                                    <MenuItem key={`${ce._id}`} value={`${ce.class}|||${ce.shiftName || ''}`}>
                                        {classEntryLabel(ce)}
                                    </MenuItem>
                                ))}
                            </TextField>
                        </Grid>

                        <Grid size={{ xs: 12, sm: 3 }}>
                            <TextField
                                select
                                label="Division"
                                fullWidth
                                required
                                value={section}
                                onChange={async (e: ChangeEvent<HTMLInputElement>) => {
                                    const next = e.target.value;
                                    setSection(next);
                                    await ensureRollNumber(classKey, next);
                                }}
                            >
                                {divisions.map((d) => (
                                    <MenuItem key={d} value={d}>{d}</MenuItem>
                                ))}
                            </TextField>
                        </Grid>

                        <Grid size={{ xs: 12, sm: 3 }}>
                            <TextField
                                label="Roll No"
                                fullWidth
                                required
                                value={rollNumber}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setRollNumber(e.target.value)}
                            />
                        </Grid>

                        <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField
                                name="admissionDate"
                                label="Admission Date"
                                type="date"
                                fullWidth
                                required
                                defaultValue={initial?.admissionDate || todayDateOnly()}
                                slotProps={{ inputLabel: { shrink: true } }}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField
                                select
                                name="gender"
                                label="Gender"
                                fullWidth
                                required
                                defaultValue={initial?.gender || ''}
                            >
                                <MenuItem value="">Select</MenuItem>
                                <MenuItem value="Male">Male</MenuItem>
                                <MenuItem value="Female">Female</MenuItem>
                                <MenuItem value="Other">Other</MenuItem>
                            </TextField>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField
                                name="feeScholarship"
                                label="Fee Scholarship"
                                type="number"
                                inputProps={{ min: 0, step: 1 }}
                                fullWidth
                                defaultValue={initial?.feeScholarship || 0}
                            />
                        </Grid>

                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField name="parentContact1" label="Father's Contact" fullWidth defaultValue={initial?.parentContact1 || ''} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField name="parentContact2" label="Mother's Contact" fullWidth defaultValue={initial?.parentContact2 || ''} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField name="fatherName" label="Father Name" fullWidth defaultValue={initial?.fatherName || ''} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField name="motherName" label="Mother Name" fullWidth defaultValue={initial?.motherName || ''} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField name="religion" label="Religion" fullWidth defaultValue={initial?.religion || ''} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField name="birthPlace" label="Birth Place" fullWidth defaultValue={initial?.birthPlace || ''} />
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                            <TextField name="address" label="Address" fullWidth defaultValue={initial?.address || ''} />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose} disabled={submitting}>Cancel</Button>
                    <Button type="submit" variant="contained" disabled={submitting}>
                        {submitting ? 'Saving...' : 'Save'}
                    </Button>
                </DialogActions>
            </Box>
        </Dialog>
    );
}
