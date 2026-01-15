'use client';

import { getAcademicYears } from '@/app/actions/academicYear';
import { getStudents } from '@/app/actions/student';
import { getEnrollments } from '@/app/actions/enrollment';
import EnrollStudentForm from './EnrollStudentForm';
import {
    Box,
    Typography,
    Paper,
    Chip,
    TextField,
    Button,
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
import { useState, useEffect, useMemo, useRef } from 'react';
import { getUiSetting, setUiSetting } from '@/app/actions/uiSettings';
import StandardDataGrid from '@/components/StandardDataGrid';

interface PageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
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
    // For future backward compatibility, map old column names to new ones if needed
    const map: Record<string, string> = {
        // Example: 'oldName': 'newName'
    };
    const out = { ...(model as Record<string, boolean>) };
    for (const [oldKey, newKey] of Object.entries(map)) {
        if (Object.prototype.hasOwnProperty.call(out, oldKey) && !Object.prototype.hasOwnProperty.call(out, newKey)) {
            out[newKey] = out[oldKey];
        }
    }
    return out;
}

export default function EnrollmentPage({ searchParams }: PageProps) {
    const [years, setYears] = useState<{ _id: string; name?: string }[]>([]);
    const [students, setStudents] = useState<any[]>([]);
    const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
    const [selectedYearId, setSelectedYearId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [columnVisibility, setColumnVisibility] = useState<GridColumnVisibilityModel>(DEFAULT_COLUMN_VISIBILITY);

    const apiRef = useGridApiRef();
    const persistTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastQueuedVisibilityRef = useRef(JSON.stringify(DEFAULT_COLUMN_VISIBILITY));
    const lastSavedVisibilityRef = useRef(JSON.stringify(DEFAULT_COLUMN_VISIBILITY));
    
        useEffect(() => {
            const loadData = async () => {
                const [yearsRes, studentsRes, params] = await Promise.all([
                    getAcademicYears(),
                    getStudents({ limit: 5000 }),
                    searchParams
                ]);
                
                const loadedYears = yearsRes as { _id: string; name?: string }[];
                setYears(loadedYears);
                setStudents(studentsRes?.data || []);
                
                const yearIdParam = params?.yearId as string | undefined;
                const currentYearId = yearIdParam || (loadedYears.length > 0 ? loadedYears[0]._id : null);
                setSelectedYearId(currentYearId);
    
                if (currentYearId) {
                    const enr = await getEnrollments(currentYearId);
                    setEnrollments(enr as Enrollment[]);
                }
                setLoading(false);
            };
            loadData();
        }, [searchParams]);

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

        const rows = useMemo(() => {
            return enrollments.map((enr, index) => ({
                id: enr._id,
                srNo: index + 1,
                class: enr.class || '-',
                section: enr.section || '-',
                rollNumber: enr.rollNumber || '-',
                admissionNumber: enr.studentId?.admissionNumber || '-',
                name: `${enr.studentId?.firstName || ''} ${enr.studentId?.lastName || ''}`.trim(),
            }));
        }, [enrollments]);
    
        // useEffect for autosize removed
    
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
    const selectedYearName = years.find(y => y._id === selectedYearId)?.name || 'None';

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

    if (loading) return <Typography sx={{ p: 3 }}>Loading...</Typography>;

    return (
        <Box sx={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
            <Typography variant="h4" gutterBottom fontWeight="bold">Enrollment Management</Typography>

            <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 4, width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
                <Typography variant="h6" gutterBottom>Enroll Student</Typography>
                <EnrollStudentForm years={years} students={students} defaultYearId={selectedYearId} />
            </Paper>

            <Box sx={{
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                justifyContent: { xs: 'flex-start', sm: 'space-between' },
                alignItems: { xs: 'flex-start', sm: 'center' },
                gap: 2,
                mb: 2,
                mt: 4,
                minWidth: 0,
                width: '100%',
            }}>
                <Typography variant="h5">Class Lists</Typography>
                <TextField
                    label="Viewing Year"
                    value={selectedYearName}
                    size="small"
                    InputProps={{ readOnly: true }}
                    sx={{ minWidth: 200 }}
                />
            </Box>

            <StandardDataGrid
                apiRef={apiRef}
                rows={rows}
                columns={columns}
                autoHeight
                initialState={{
                    pagination: { paginationModel: { pageSize: 10 } },
                }}
                pageSizeOptions={[10, 25, 50]}
                columnVisibilityModel={columnVisibility}
                onColumnVisibilityModelChange={queuePersistColumns}
                slots={{ toolbar: GridToolbar }}
            />
        </Box>
    );
}
