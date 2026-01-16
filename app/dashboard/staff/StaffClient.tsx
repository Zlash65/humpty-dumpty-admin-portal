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
    Tooltip,
    Chip,
    Divider,
    Stack,
    IconButton
} from '@mui/material';
import { Add as AddIcon, Print as PrintIcon, AssessmentOutlined as ReportIcon, Person as PersonIcon, RestartAlt as ResetIcon, Download as DownloadIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
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
import { createStaff, deleteStaff, getStaffById, getStaffOptionById, getStaffPage, searchStaffOptions, updateStaff } from '@/app/actions/staff';
import { getStudentsByTeacher } from '@/app/actions/student';
import { getUiSetting, setUiSetting } from '@/app/actions/uiSettings';
import StandardDataGrid from '@/components/StandardDataGrid';
import AsyncSearchableSelect from '@/components/ui/AsyncSearchableSelect';
import SearchableSelect, { type SearchableSelectOption } from '@/components/ui/SearchableSelect';
import MultiSearchableSelect from '@/components/ui/MultiSearchableSelect';
import useServerPaginatedGrid from '@/components/ui/grid/useServerPaginatedGrid';
import ExportAllCsvButton from '@/components/ui/grid/ExportAllCsvButton';
import { divisionsFromCount } from '@/lib/divisions';

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
    division?: string;
    shiftName?: string;
    parentContact1?: string;
    parentContact2?: string;
}

interface Message {
    type: 'success' | 'error' | 'info' | 'warning';
    text: string;
}

interface StaffClientProps {
    initialStaff?: StaffMember[];
    initialStaffRowCount?: number;
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

export default function StaffClient({
    initialStaff = [],
    initialStaffRowCount = 0,
    classEntries = [],
    branches = [],
    academicYearId,
    branchId,
    branchName = '',
    yearName = '',
}: StaffClientProps) {
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

    const fetchStaffPage = useCallback(
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
            const res = await getStaffPage({ page, pageSize, search, sortModel, filterModel });
            return {
                rows: Array.isArray(res?.rows) ? res.rows : [],
                total: Number(res?.total) || 0,
            };
        },
        []
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
    } = useServerPaginatedGrid<StaffMember>({
        initialRows: initialStaff,
        initialRowCount: initialStaffRowCount,
        initialPaginationModel: { page: 0, pageSize: 10 },
        query,
        minChars: 2,
        debounceMs: 300,
        fetchPage: fetchStaffPage,
    });

    const staffRows: StaffRow[] = useMemo(() => {
        const baseIndex = paginationModel.page * paginationModel.pageSize;
        return (rows || []).map((s, idx) => ({
            ...s,
            srNo: baseIndex + idx + 1,
        }));
    }, [paginationModel.page, paginationModel.pageSize, rows]);

    const [teacherValueOption, setTeacherValueOption] = useState<SearchableSelectOption | null>(null);
    const [selectedTeacher, setSelectedTeacher] = useState<StaffMember | null>(null);
    useEffect(() => {
        let cancelled = false;
        if (!reportTeacherId) {
            setTeacherValueOption(null);
            setSelectedTeacher(null);
            return;
        }
        getStaffOptionById(reportTeacherId)
            .then((opt) => {
                if (cancelled) return;
                setTeacherValueOption(opt ? { value: opt.value, label: opt.label, keywords: opt.keywords } : null);
            })
            .catch(() => {
                if (cancelled) return;
                setTeacherValueOption(null);
            });

        getStaffById(reportTeacherId)
            .then((staff) => {
                if (cancelled) return;
                if (!staff) {
                    setSelectedTeacher(null);
                    return;
                }
                setSelectedTeacher({
                    _id: staff._id,
                    name: staff.name,
                    staffType: staff.staffType,
                    contact: staff.contact,
                    email: staff.email,
                    role: staff.role,
                    assignments: (staff.assignments || []).map((a) => ({
                        classEntryId: a.classEntryId ?? undefined,
                        branchId: a.branchId ?? undefined,
                        className: a.className || undefined,
                        shiftName: a.shiftName || undefined,
                        division: a.division || undefined,
                    })),
                });
            })
            .catch(() => {
                if (cancelled) return;
                setSelectedTeacher(null);
            });
        return () => {
            cancelled = true;
        };
    }, [reportTeacherId]);

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
                        class_display: `${r.className || ''}${r.division ? ` (${r.division})` : ''}${r.shiftName ? ` \u2022 ${r.shiftName}` : ''}`,
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

    const fetchTeacherOptions = useCallback(
        async (q: string) => searchStaffOptions({ query: q, staffType: 'teacher' }),
        []
    );

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

    const assignedClassSelectOptions = useMemo<SearchableSelectOption[]>(
        () =>
            teacherAssignedClasses.map((c) => ({
                value: c.key,
                label: c.label,
                keywords: c.key.split('|||').join(' '),
            })),
        [teacherAssignedClasses]
    );

    const divisionSelectOptions = useMemo<SearchableSelectOption[]>(
        () => availableDivisions.map((d) => ({ value: d, label: d })),
        [availableDivisions]
    );

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
                    division: reportDivision || null,
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
                    {loading && searchActive && <Chip size="small" label="Searching..." />}
                    <ExportAllCsvButton
                        entity="staff"
                        filename={fileName}
                        disabled={loading}
                        payload={{
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
                        startIcon={<ReportIcon />}
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
                    placeholder="Search by name, contact, role (min 2 chars)..."
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
                rows={staffRows}
                columns={columns}
                getRowId={(row) => row._id}
                autoHeight
                loading={loading}
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
                    refreshRows();
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
                    refreshRows();
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
                            refreshRows();
                        }}
                    >
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={reportOpen} onClose={() => setReportOpen(false)} fullWidth maxWidth="lg">
                <DialogTitle sx={{ pb: 1 }}>
                    <Box>
                        <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                            Teacher-wise Student Report
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {formatNow()} • Total: {reportRows.length}
                        </Typography>
                    </Box>
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

	                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }} alignItems={{ xs: 'stretch', sm: 'center' }}>
	                        <Box sx={{ minWidth: 220 }}>
	                            <AsyncSearchableSelect
	                                label="Teacher"
	                                placeholder="Type to search"
	                                value={reportTeacherId}
	                                valueOption={teacherValueOption}
	                                onChange={(next) => {
	                                    setReportTeacherId(next);
	                                    setReportClassKey('');
	                                    setReportDivision('');
	                                }}
	                                fetchOptions={fetchTeacherOptions}
	                                listboxMaxHeight={360}
	                            />
	                        </Box>

                        <Box sx={{ minWidth: 220 }}>
                            <SearchableSelect
                                label="Class"
                                placeholder="All Classes"
                                value={reportClassKey}
                                onChange={(next) => {
                                    setReportClassKey(next);
                                    setReportDivision('');
                                    setReportRows([]);
                                }}
                                options={assignedClassSelectOptions}
                                listboxMaxHeight={360}
                                disabled={!reportTeacherId}
                            />
                        </Box>

                        <Box sx={{ minWidth: 140 }}>
                            <SearchableSelect
                                label="Division"
                                placeholder="All Divisions"
                                value={reportDivision}
                                onChange={(next) => {
                                    setReportDivision(next);
                                    setReportRows([]);
                                }}
                                options={divisionSelectOptions}
                                listboxMaxHeight={360}
                                disabled={!reportTeacherId || !reportClassKey || divisionSelectOptions.length === 0}
                            />
                        </Box>

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

                    <StandardDataGrid
                        rows={reportRows.map((r, idx) => ({ ...r, srNo: idx + 1 }))}
                        getRowId={(row) => row._id || `${row.name}-${row.rollNumber}-${row.className}-${row.division}`}
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
                                    `${row?.className || ''}${row?.division ? ` (${row.division})` : ''}${row?.shiftName ? ` \u2022 ${row.shiftName}` : ''}`,
                            },
                        ]}
                        autoHeight
                        disableRowSelectionOnClick
                        disableVirtualization
                        loading={reportLoading}
                        pageSizeOptions={[10]}
                        initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
                        paperSx={{ p: 1 }}
                    />
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
    const staffTypeOptions = useMemo<SearchableSelectOption[]>(
        () => [
            { value: 'office', label: 'Office Staff', keywords: 'office staff' },
            { value: 'teacher', label: 'Teacher', keywords: 'teacher' },
        ],
        []
    );
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

    const classSelectOptions = useMemo<SearchableSelectOption[]>(() => {
        const opts: SearchableSelectOption[] = (classEntries || []).map((ce) => {
            const bName = branchNameById.get(String(ce.branchId)) || '';
            const prefix = bName ? `${bName} \u2022 ` : '';
            const label = `${prefix}${classEntryLabel(ce)}`.trim();
            return {
                value: String(ce._id),
                label,
                keywords: `${bName} ${ce.class || ''} ${ce.shiftName || ''}`.trim(),
            };
        });

        // Add legacy options if there are assignments we couldn't resolve.
        const legacy: SearchableSelectOption[] = [];
        for (const row of assignmentsUi || []) {
            if (row?.classEntryId) continue;
            const key = String(row?.classKey || '').trim();
            if (!key) continue;
            const [cls, shift] = key.split('|||');
            const display = `${cls}${shift ? ` \u2022 ${shift}` : ''} (Legacy)`;
            const value = `legacy:${key}`;
            if (!opts.some((o) => o.value === value) && !legacy.some((o) => o.value === value)) {
                legacy.push({ value, label: display, keywords: `${cls} ${shift || ''}`.trim() });
            }
        }

        return [...opts, ...legacy].sort((a, b) => a.label.localeCompare(b.label));
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
                            <SearchableSelect
                                label="Staff Type"
                                placeholder="Select"
                                size="medium"
                                value={staffType}
                                onChange={setStaffType}
                                options={staffTypeOptions}
                                required
                                disableClearable
                                listboxMaxHeight={240}
                            />
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
                                            <Grid key={idx} container columnSpacing={2} rowSpacing={0} alignItems="center" sx={{ mb: 1 }}>
                                                <Grid size={{ xs: 12, md: 5 }}>
                                                    <SearchableSelect
                                                        label="Class"
                                                        placeholder="Select class"
                                                        size="medium"
                                                        value={selectValue}
                                                        onChange={(raw) => {
                                                            const next = [...assignmentsUi];
                                                            if (!raw) {
                                                                next[idx] = { ...next[idx], classEntryId: '', classKey: '', divisions: [] };
                                                                setAssignmentsUi(next);
                                                                return;
                                                            }

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
                                                        options={classSelectOptions}
                                                        listboxMaxHeight={360}
                                                    />
                                                </Grid>
                                                <Grid size={{ xs: 12, md: 5 }}>
                                                    <MultiSearchableSelect
                                                        label="Divisions"
                                                        placeholder="All"
                                                        size="medium"
                                                        value={row.divisions || []}
                                                        onChange={(nextDivs) => {
                                                            const next = [...assignmentsUi];
                                                            next[idx] = { ...next[idx], divisions: nextDivs };
                                                            setAssignmentsUi(next);
                                                        }}
                                                        options={divs.map((d) => ({ value: d, label: d }))}
                                                        disabled={!selectValue}
                                                        listboxMaxHeight={240}
                                                        limitTags={2}
                                                    />
                                                </Grid>
                                                <Grid size={{ xs: 12, md: 2 }}>
                                                    <Box sx={{ display: 'flex', justifyContent: { xs: 'flex-end', md: 'center' } }}>
                                                        <Tooltip title="Remove assignment">
                                                            <IconButton
                                                                aria-label="Remove assignment"
                                                                color="error"
                                                                onClick={() => {
                                                                    const next = assignmentsUi.filter((_, i) => i !== idx);
                                                                    setAssignmentsUi(next.length ? next : [{ classEntryId: '', classKey: '', divisions: [] }]);
                                                                }}
                                                            >
                                                                <DeleteIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                    </Box>
                                                </Grid>

                                                {/* helper row (keeps delete button aligned with the inputs row) */}
                                                <Grid size={{ xs: 12, md: 5 }} />
                                                <Grid size={{ xs: 12, md: 5 }}>
                                                    <Typography variant="caption" color="text.secondary" sx={{ ml: 2, lineHeight: 1.1 }}>
                                                        Leave empty for all divisions
                                                    </Typography>
                                                </Grid>
                                                <Grid size={{ xs: 12, md: 2 }} />
                                            </Grid>
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
