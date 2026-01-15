'use client';

import EnrollStudentForm from './EnrollStudentForm';
import {
    Box,
    Typography,
    Paper,
    TextField,
    IconButton,
    Tooltip,
} from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import {
    GridColDef,
    useGridApiRef,
    GridToolbarContainer,
    GridToolbarColumnsButton,
    GridToolbarFilterButton,
    GridToolbarDensitySelector,
    GridToolbarExport,
    GridRenderCellParams,
    GridColumnVisibilityModel,
} from '@mui/x-data-grid';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getEnrollmentsPage } from '@/app/actions/enrollment';
import { getUiSetting, setUiSetting } from '@/app/actions/uiSettings';
import StandardDataGrid from '@/components/StandardDataGrid';
import useServerPaginatedGrid from '@/components/ui/grid/useServerPaginatedGrid';
import ExportAllCsvButton from '@/components/ui/grid/ExportAllCsvButton';

interface AcademicYear {
    _id: string;
    name?: string;
}

interface Enrollment {
    _id: string;
    class?: string;
    section?: string;
    rollNumber?: string;
    studentId?: {
        _id?: string;
        admissionNumber?: string;
        firstName?: string;
        lastName?: string;
    };
}

export interface EnrollmentClientProps {
    years: AcademicYear[];
    academicYearId: string;
    branchId: string;
    yearName?: string;
    initialEnrollments: Enrollment[];
    initialEnrollmentRowCount?: number;
}

const DEFAULT_COLUMN_VISIBILITY: GridColumnVisibilityModel = {
    srNo: true,
    class: true,
    section: true,
    rollNumber: true,
    admissionNumber: true,
    name: true,
};

function normalizeEnrollmentColumnsModel(model: unknown): GridColumnVisibilityModel | null {
    if (!model || typeof model !== 'object') return null;
    const map: Record<string, string> = {};
    const out = { ...(model as Record<string, boolean>) };
    for (const [oldKey, newKey] of Object.entries(map)) {
        if (Object.prototype.hasOwnProperty.call(out, oldKey) && !Object.prototype.hasOwnProperty.call(out, newKey)) {
            out[newKey] = out[oldKey];
        }
    }
    return out;
}

export default function EnrollmentClient({
    years,
    academicYearId,
    branchId,
    yearName,
    initialEnrollments,
    initialEnrollmentRowCount = 0,
}: EnrollmentClientProps) {
    const apiRef = useGridApiRef();
    const persistTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastQueuedVisibilityRef = useRef(JSON.stringify(DEFAULT_COLUMN_VISIBILITY));
    const lastSavedVisibilityRef = useRef(JSON.stringify(DEFAULT_COLUMN_VISIBILITY));

    const [columnVisibility, setColumnVisibility] = useState<GridColumnVisibilityModel>(DEFAULT_COLUMN_VISIBILITY);

    useEffect(() => {
        (async () => {
            try {
                const saved = await getUiSetting('enrollmentTableSettings');
                const model = normalizeEnrollmentColumnsModel((saved as { columnVisibilityModel?: unknown })?.columnVisibilityModel);
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
                await setUiSetting('enrollmentTableSettings', { columnVisibilityModel: next }, 'general');
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

    const fetchEnrollmentPage = useCallback(
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
            const res = await getEnrollmentsPage({ academicYearId, branchId, search, page, pageSize, sortModel, filterModel });
            return {
                rows: Array.isArray(res?.rows) ? res.rows : [],
                total: Number(res?.total) || 0,
            };
        },
        [academicYearId, branchId]
    );

    const {
        rows: enrollments,
        rowCount,
        paginationModel,
        setPaginationModel,
        sortModel,
        onSortModelChange,
        filterModel,
        onFilterModelChange,
        loading,
        effectiveSearch,
        refresh: refreshRows,
    } = useServerPaginatedGrid<Enrollment>({
        initialRows: initialEnrollments,
        initialRowCount: initialEnrollmentRowCount,
        initialPaginationModel: { page: 0, pageSize: 10 },
        query: '',
        minChars: 2,
        debounceMs: 300,
        fetchPage: fetchEnrollmentPage,
    });

    const rows = useMemo(() => {
        const baseIndex = paginationModel.page * paginationModel.pageSize;
        return enrollments.map((enr, index) => ({
            id: enr._id,
            srNo: baseIndex + index + 1,
            class: enr.class || '-',
            section: enr.section || '-',
            rollNumber: enr.rollNumber || '-',
            admissionNumber: enr.studentId?.admissionNumber || '-',
            name: `${enr.studentId?.firstName || ''} ${enr.studentId?.lastName || ''}`.trim(),
        }));
    }, [enrollments, paginationModel.page, paginationModel.pageSize]);

    const selectedYearName = yearName || years.find((y) => y._id === academicYearId)?.name || 'None';

    const columns: GridColDef[] = [
        {
            field: 'srNo',
            headerName: 'Sr No',
            width: 100,
            sortable: false,
            filterable: false,
            disableColumnMenu: true,
            headerAlign: 'center',
            align: 'center',
        },
        {
            field: 'class',
            headerName: 'Class',
            flex: 1,
            minWidth: 140,
            headerAlign: 'center',
            align: 'center',
            renderCell: (params: GridRenderCellParams) => (
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
            ),
        },
        {
            field: 'section',
            headerName: 'Section',
            flex: 1,
            minWidth: 140,
            headerAlign: 'center',
            align: 'center',
            renderCell: (params: GridRenderCellParams) => (
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
            ),
        },
        {
            field: 'rollNumber',
            headerName: 'Roll No',
            flex: 1,
            minWidth: 140,
            headerAlign: 'center',
            align: 'center',
            renderCell: (params: GridRenderCellParams) => (
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
            ),
        },
        {
            field: 'admissionNumber',
            headerName: 'Admission No',
            flex: 1,
            minWidth: 160,
            headerAlign: 'center',
            align: 'center',
            renderCell: (params: GridRenderCellParams) => (
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
            ),
        },
        {
            field: 'name',
            headerName: 'Name',
            flex: 1.2,
            minWidth: 200,
            renderCell: (params: GridRenderCellParams) => (
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
                <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', height: '100%', justifyContent: 'center' }}>
                    <Tooltip title="Edit">
                        <IconButton
                            size="small"
                            onClick={() => {
                                console.log('Edit enrollment:', params.row);
                                // TODO: Implement edit dialog
                            }}
                        >
                            <EditIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                        <IconButton
                            size="small"
                            color="error"
                            onClick={() => {
                                console.log('Delete enrollment:', params.row);
                                // TODO: Implement delete dialog
                            }}
                        >
                            <DeleteIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Box>
            ),
        },
    ];

    function GridToolbar() {
        const fileName = `enrollment-${selectedYearName || ''}`.trim().replace(/\s+/g, '-');
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
                        entity="enrollment"
                        filename={fileName}
                        disabled={loading}
                        payload={{
                            academicYearId,
                            branchId,
                            search: effectiveSearch,
                            sortModel,
                            filterModel,
                        }}
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
            <Typography variant="h4" gutterBottom fontWeight="bold">
                Enrollment Management
            </Typography>

            <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 4, width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
                <Typography variant="h6" gutterBottom>
                    Enroll Student
                </Typography>
                <EnrollStudentForm years={years} defaultYearId={academicYearId} branchId={branchId} onEnrolled={refreshRows} />
            </Paper>

            <Box
                sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    justifyContent: { xs: 'flex-start', sm: 'space-between' },
                    alignItems: { xs: 'flex-start', sm: 'center' },
                    gap: 2,
                    mb: 2,
                    mt: 4,
                    minWidth: 0,
                    width: '100%',
                }}
            >
                <Typography variant="h5">Class Lists</Typography>
                <TextField label="Viewing Year" value={selectedYearName} size="small" InputProps={{ readOnly: true }} sx={{ minWidth: 200 }} />
            </Box>

            <StandardDataGrid
                apiRef={apiRef}
                rows={rows}
                columns={columns}
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
                columnVisibilityModel={columnVisibility}
                onColumnVisibilityModelChange={queuePersistColumns}
                slots={{ toolbar: GridToolbar }}
            />
        </Box>
    );
}
