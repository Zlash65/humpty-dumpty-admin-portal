'use client';

import { useCallback, useEffect, useMemo, useRef, useState, FormEvent, ChangeEvent } from 'react';
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
    DialogContentText,
    Stack,
    Divider,
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Visibility as VisibilityIcon,
    Print as PrintIcon,
    AssessmentOutlined as ReportIcon,
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
import { admitStudent, deleteStudent, getNextRollNumber, getStudentDirectoryPage, updateAdmittedStudent } from '@/app/actions/student';
import { getUiSetting, setUiSetting } from '@/app/actions/uiSettings';
import StandardDataGrid from '@/components/StandardDataGrid';
import useServerPaginatedGrid from '@/components/ui/grid/useServerPaginatedGrid';
import ExportAllCsvButton from '@/components/ui/grid/ExportAllCsvButton';
import SearchableSelect, { type SearchableSelectOption } from '@/components/ui/SearchableSelect';
import { divisionsFromCount } from '@/lib/divisions';

const REPORT_GENDER_OPTIONS: SearchableSelectOption[] = [
    { value: 'male', label: 'Male', keywords: 'male m' },
    { value: 'female', label: 'Female', keywords: 'female f' },
    { value: 'other', label: 'Other', keywords: 'other o' },
];

const STUDENT_GENDER_OPTIONS: SearchableSelectOption[] = [
    { value: 'Male', label: 'Male', keywords: 'male m' },
    { value: 'Female', label: 'Female', keywords: 'female f' },
    { value: 'Other', label: 'Other', keywords: 'other o' },
];

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
    division?: string;
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

interface StudentsClientProps {
    initialStudents?: StudentRow[];
    initialStudentRowCount?: number;
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

export default function StudentsClient({
    initialStudents = [],
    initialStudentRowCount = 0,
    academicYearId,
    branchId,
    classEntries = [],
    branchName = '',
    yearName = '',
}: StudentsClientProps) {
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
    const [reportStudents, setReportStudents] = useState<StudentRow[] | null>(null);
    const [reportStudentsLoading, setReportStudentsLoading] = useState(false);
    const [reportTotal, setReportTotal] = useState(0);
    const [reportTruncated, setReportTruncated] = useState(false);
    const reportFetchIdRef = useRef(0);

    const [columnVisibility, setColumnVisibility] = useState<GridColumnVisibilityModel>(DEFAULT_COLUMN_VISIBILITY);
    const persistTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastQueuedVisibilityRef = useRef(JSON.stringify(DEFAULT_COLUMN_VISIBILITY));
    const lastSavedVisibilityRef = useRef(JSON.stringify(DEFAULT_COLUMN_VISIBILITY));

    const openReport = useCallback(async () => {
        setReportOpen(true);
    }, []);

    const closeReport = useCallback(() => {
        reportFetchIdRef.current += 1;
        setReportOpen(false);
        setReportStudents(null);
        setReportStudentsLoading(false);
        setReportTotal(0);
        setReportTruncated(false);
    }, []);

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

    const fetchStudentPage = useCallback(
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
            const res = await getStudentDirectoryPage({ academicYearId, branchId, search, page, pageSize, sortModel, filterModel });
            return {
                rows: Array.isArray(res?.rows) ? res.rows : [],
                total: Number(res?.total) || 0,
            };
        },
        [academicYearId, branchId]
    );

    const {
        rows,
        rowCount,
        paginationModel,
        setPaginationModel,
        sortModel,
        onSortModelChange,
        filterModel,
        onFilterModelChange,
        loading,
        searchActive,
        effectiveSearch,
        refresh: refreshRows,
    } = useServerPaginatedGrid<StudentRow>({
        initialRows: initialStudents,
        initialRowCount: initialStudentRowCount,
        initialPaginationModel: { page: 0, pageSize: 10 },
        query,
        minChars: 2,
        debounceMs: 300,
        fetchPage: fetchStudentPage,
    });

    const gridRows = useMemo(() => {
        const baseIndex = paginationModel.page * paginationModel.pageSize;
        return (rows || []).map((r, idx) => ({ ...r, srNo: baseIndex + idx + 1 }));
    }, [paginationModel.page, paginationModel.pageSize, rows]);

    useEffect(() => {
        if (gridRows.length > 0) {
            const timeout = setTimeout(() => {
                apiRef.current.autosizeColumns({
                    includeHeaders: true,
                    columns: ['srNo', 'name'],
                    includeOutliers: true,
                });
            }, 100);
            return () => clearTimeout(timeout);
        }
    }, [gridRows, apiRef]);

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
            class_display: `${r.className || ''}${r.division ? ` (${r.division})` : ''}${r.shiftName ? ` \u2022 ${r.shiftName}` : ''}`,
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

    const reportClassSelectOptions = useMemo<SearchableSelectOption[]>(
        () =>
            (classes || [])
                .filter((c) => Boolean(c.displayName))
                .map((c) => ({
                    value: String(c.id),
                    label: c.displayName,
                    keywords: `${c.class || ''} ${c.shiftName || ''}`.trim(),
                }))
                .sort((a, b) => a.label.localeCompare(b.label)),
        [classes]
    );

    const reportDivisionSelectOptions = useMemo<SearchableSelectOption[]>(
        () => availableDivisions.map((d) => ({ value: d, label: d })),
        [availableDivisions]
    );

    const reportFilterModel = useMemo(() => {
        const items: Array<{ field: string; operator: string; value: unknown }> = [];
        const selected = reportClassId ? (classes || []).find((c) => String(c.id) === String(reportClassId)) : null;
        if (selected) {
            items.push({ field: 'class_name', operator: 'equals', value: selected.class || '' });
            items.push({ field: 'shift_name', operator: 'equals', value: selected.shiftName || '' });
        }
        if (reportDivision) {
            items.push({ field: 'division', operator: 'equals', value: reportDivision });
        }
        if (reportGender) {
            items.push({ field: 'gender', operator: 'equals', value: reportGender });
        }
        return { items };
    }, [classes, reportClassId, reportDivision, reportGender]);

    useEffect(() => {
        if (!reportOpen) return;

        const requestId = ++reportFetchIdRef.current;
        setReportStudentsLoading(true);
        setReportStudents(null);
        setReportTruncated(false);

        const PAGE_SIZE = 200;
        const MAX_REPORT_ROWS = 5000;

        (async () => {
            try {
                let page = 0;
                let total = 0;
                const all: StudentRow[] = [];
                let truncated = false;

                while (true) {
                    const res = await getStudentDirectoryPage({
                        academicYearId,
                        branchId,
                        search: '',
                        page,
                        pageSize: PAGE_SIZE,
                        sortModel: [{ field: 'name', sort: 'asc' }],
                        filterModel: reportFilterModel,
                    });
                    if (reportFetchIdRef.current !== requestId) return;

                    if (page === 0) total = Number(res?.total) || 0;

                    const rows = Array.isArray(res?.rows) ? (res.rows as StudentRow[]) : [];
                    all.push(...rows);

                    if (all.length >= total) break;
                    if (rows.length === 0) break;
                    if (all.length >= MAX_REPORT_ROWS) {
                        truncated = true;
                        break;
                    }
                    page += 1;
                }

                if (reportFetchIdRef.current !== requestId) return;
                setReportTotal(total);
                setReportTruncated(truncated);
                setReportStudents(all.slice(0, MAX_REPORT_ROWS));
            } catch {
                if (reportFetchIdRef.current !== requestId) return;
                setReportTotal(0);
                setReportTruncated(false);
                setReportStudents([]);
            } finally {
                if (reportFetchIdRef.current !== requestId) return;
                setReportStudentsLoading(false);
            }
        })();
    }, [academicYearId, branchId, reportFilterModel, reportOpen]);

    const reportFiltered = useMemo(() => {
        const list = reportStudents || [];
        return list.map((item, index) => {
            const class_display = `${item.className || ''}${item.shiftName ? ` - ${item.shiftName}` : ''}${item.division ? ` (${item.division})` : ''}`;
            return { ...item, srNo: index + 1, class_display };
        });
    }, [reportStudents]);

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
        const html = buildReportHtml(gridRows);
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
                valueGetter: (_value, row) => `${row?.className || ''}${row?.shiftName ? ` - ${row.shiftName}` : ''}${row?.division ? ` (${row.division})` : ''}`,
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
                    {loading && searchActive && <Chip size="small" label="Searching..." />}
                    <ExportAllCsvButton
                        entity="students"
                        filename={fileName}
                        disabled={loading}
                        payload={{
                            academicYearId,
                            branchId,
                            search: effectiveSearch,
                            sortModel,
                            filterModel,
                        }}
                        onError={(msg) => setMessage({ type: 'error', text: msg })}
                    />
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<DownloadIcon />}
                        onClick={() => downloadTextFile(`student-report-${Date.now()}.html`, buildReportHtml(gridRows), 'text/html')}
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
                        startIcon={<ReportIcon />}
                        onClick={openReport}
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
	                    placeholder="Search by name, roll no, class, division, contact (min 2 chars)..."
	                    label="Search"
	                    size="small"
	                    sx={{ width: '100%', maxWidth: '100%' }}
	                    slotProps={{
	                        input: {
	                            endAdornment: loading && searchActive ? <CircularProgress size={18} /> : undefined,
	                        },
	                    }}
	                />
	            </Paper>

	            <StandardDataGrid
	                apiRef={apiRef}
	                rows={gridRows}
	                columns={columns}
	                getRowId={(row) => row._id}
	                autoHeight
	                loading={loading}
	                stickyActionsField="actions"
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
                initialState={{ sorting: { sortModel: [{ field: 'srNo', sort: 'asc' }] } }}
                columnVisibilityModel={columnVisibility}
                onColumnVisibilityModelChange={(model) => {
                    queuePersistColumns(model);
                }}
                slots={{ toolbar: GridToolbar }}
            />

            <Dialog
                open={reportOpen}
                onClose={closeReport}
                fullWidth
                maxWidth="lg"
            >
                <DialogTitle sx={{ pb: 1 }}>
                    <Box>
                        <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                            Student Report
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {reportGeneratedAt} • Total: {reportStudentsLoading ? 'Loading…' : reportCount}
                        </Typography>
                    </Box>
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
                        <Box sx={{ minWidth: 200 }}>
                            <SearchableSelect
                                label="Class"
                                placeholder="All"
                                value={reportClassId}
                                onChange={(next) => {
                                    setReportClassId(next);
                                    setReportDivision('');
                                }}
                                options={reportClassSelectOptions}
                                listboxMaxHeight={360}
                            />
                        </Box>

                        <Box sx={{ minWidth: 120 }}>
                            <SearchableSelect
                                label="Division"
                                placeholder="All"
                                value={reportDivision}
                                onChange={(next) => setReportDivision(next)}
                                options={reportDivisionSelectOptions}
                                listboxMaxHeight={360}
                                disabled={!reportClassId || reportDivisionSelectOptions.length === 0}
                            />
                        </Box>

                        <Box sx={{ minWidth: 120 }}>
                            <SearchableSelect
                                label="Gender"
                                placeholder="All"
                                value={reportGender}
                                onChange={(next) => setReportGender(next)}
                                options={REPORT_GENDER_OPTIONS}
                                listboxMaxHeight={240}
                            />
                        </Box>

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

                    <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            Showing {reportCount}{reportTotal ? ` of ${reportTotal}` : ''} result(s)
                        </Typography>
                        {reportStudentsLoading && <Chip size="small" label="Loading…" />}
                        {reportTruncated && (
                            <Chip
                                size="small"
                                color="warning"
                                label="Showing first 5000 rows. Narrow filters to see all."
                            />
                        )}
                    </Stack>
                    <Box sx={{ width: '100%', height: '60vh' }}>
                        <StandardDataGrid
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
                            autoHeight={false}
                            sx={{ height: '100%' }}
                            paperSx={{ height: '100%' }}
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="outlined"
                        startIcon={<DownloadIcon />}
                        onClick={() => downloadTextFile(`student-report-${Date.now()}.html`, buildStudentReportHtml(reportFiltered), 'text/html')}
                        disabled={reportStudentsLoading || reportCount === 0}
                    >
                        Download HTML
                    </Button>
                    <Button variant="contained" color="primary" onClick={printStudentReport} disabled={reportStudentsLoading || reportCount === 0}>
                        Print
                    </Button>
                    <Button
                        onClick={() => {
                            closeReport();
                        }}
                    >
                        Close
                    </Button>
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
                    refreshRows();
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
                    refreshRows();
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
                                {viewRow.division ? ` (${viewRow.division})` : ''}
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
                            refreshRows();
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
    const [division, setDivision] = useState(initial?.division || 'A');
    const [rollNumber, setRollNumber] = useState(initial?.rollNumber || '');
    const [gender, setGender] = useState(initial?.gender || '');

    // Sync dialog fields when switching rows or reopening.
    // (Without this, editing multiple rows in a row can show stale values.)
    useEffect(() => {
        if (!open) return;
        setError('');
        setSubmitting(false);
        setClassKey(initial ? `${initial.className}|||${initial.shiftName || ''}` : '');
        setDivision(initial?.division || 'A');
        setRollNumber(initial?.rollNumber || '');
        setGender(initial?.gender || '');
    }, [open, initial]);

    const selectedEntry = useMemo(() => {
        if (!classKey) return null;
        const [cls, shift] = classKey.split('|||');
        return (classEntries || []).find((e) => String(e.class) === String(cls) && String(e.shiftName || '') === String(shift || '')) || null;
    }, [classEntries, classKey]);

    const divisions = useMemo(() => divisionsFromCount(selectedEntry?.numDivisions || 1), [selectedEntry?.numDivisions]);
    const classOptions = useMemo<SearchableSelectOption[]>(() => {
        return (classEntries || [])
            .filter((ce) => Boolean(classEntryLabel(ce)))
            .map((ce) => {
                const value = `${ce.class}|||${ce.shiftName || ''}`;
                const label = classEntryLabel(ce);
                const keywords = `${ce.class || ''} ${ce.shiftName || ''}`.trim();
                return { value, label, keywords };
            });
    }, [classEntries]);
    const divisionOptions = useMemo<SearchableSelectOption[]>(
        () => (divisions || []).map((d) => ({ value: d, label: d })),
        [divisions]
    );

    const ensureRollNumber = async (nextClassKey: string, nextDivision: string) => {
        const [cls, shift] = (nextClassKey || '').split('|||');
        if (!academicYearId || !cls || !nextDivision) return;
        const res = await getNextRollNumber({
            academicYearId,
            className: cls,
            shiftName: shift || '',
            division: nextDivision,
        });
        if (res?.next) setRollNumber(String(res.next));
    };

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');

        if (!classKey) {
            setSubmitting(false);
            setError('Class is required');
            onDone?.({ error: 'Class is required' });
            return;
        }
        if (!gender) {
            setSubmitting(false);
            setError('Gender is required');
            onDone?.({ error: 'Gender is required' });
            return;
        }

        const formData = new FormData(e.currentTarget);

        // Normalize class/shift from the UI key
        const [cls, shift] = (classKey || '').split('|||');
        formData.set('class', cls || '');
        formData.set('shiftName', shift || '');
        formData.set('division', division || '');
        formData.set('rollNumber', rollNumber || '');
        formData.set('gender', gender || '');
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
                            <SearchableSelect
                                label="Class"
                                placeholder="Type to search"
                                size="medium"
                                value={classKey}
                                onChange={async (next) => {
                                    setClassKey(next);
                                    const entry = (classEntries || []).find((ce) => `${ce.class}|||${ce.shiftName || ''}` === next) || null;
                                    const nextDivision = divisionsFromCount(entry?.numDivisions || 1)[0] || 'A';
                                    setDivision(nextDivision);
                                    await ensureRollNumber(next, nextDivision);
                                }}
                                options={classOptions}
                                listboxMaxHeight={360}
                                required
                            />
                        </Grid>

                        <Grid size={{ xs: 12, sm: 3 }}>
                            <SearchableSelect
                                label="Division"
                                size="medium"
                                value={division}
                                onChange={async (next) => {
                                    setDivision(next);
                                    await ensureRollNumber(classKey, next);
                                }}
                                options={divisionOptions}
                                required
                                disableClearable
                                disabled={!classKey}
                            />
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
                            <SearchableSelect
                                name="gender"
                                label="Gender"
                                placeholder="Select"
                                size="medium"
                                value={gender}
                                onChange={setGender}
                                options={STUDENT_GENDER_OPTIONS}
                                required
                                listboxMaxHeight={240}
                            />
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
