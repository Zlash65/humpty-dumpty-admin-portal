'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    Typography,
    Chip,
    Box,
    Paper,
    Button,
    IconButton,
    Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Stack,
    Divider,
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Login as LoginIcon,
    Logout as LogoutIcon,
    Visibility as VisibilityIcon,
} from '@mui/icons-material';
import { SvgIconComponent } from '@mui/icons-material';
import {
    GridToolbarContainer,
    GridToolbarColumnsButton,
    GridToolbarFilterButton,
    GridToolbarDensitySelector,
    GridToolbarExport,
    GridColDef,
    GridRenderCellParams,
    GridColumnVisibilityModel,
    GridPaginationModel,
    useGridApiRef,
} from '@mui/x-data-grid';
import { getUiSetting, setUiSetting } from '@/app/actions/uiSettings';
import StandardDataGrid from '@/components/StandardDataGrid';

interface ActionConfig {
    icon: SvgIconComponent;
    color: string;
    bgcolor: string;
    label: string;
}

type ActionType = 'create' | 'update' | 'delete' | 'login' | 'logout';

const actionConfig: Record<ActionType, ActionConfig> = {
    create: { icon: AddIcon, color: '#059669', bgcolor: '#ecfdf5', label: 'Created' },
    update: { icon: EditIcon, color: '#4f46e5', bgcolor: '#f0f4ff', label: 'Updated' },
    delete: { icon: DeleteIcon, color: '#e11d48', bgcolor: '#fff1f2', label: 'Deleted' },
    login: { icon: LoginIcon, color: '#0891b2', bgcolor: '#ecfeff', label: 'Login' },
    logout: { icon: LogoutIcon, color: '#64748b', bgcolor: '#f1f5f9', label: 'Logout' },
};

const entityLabels: Record<string, string> = {
    student: 'Student',
    staff: 'Staff',
    fee: 'Fee Record',
    enrollment: 'Enrollment',
    transport: 'Transport',
    branch: 'Branch',
    academicYear: 'Academic Year',
    settings: 'Settings',
    user: 'User',
};

interface ChangeValue {
    old?: string | number | boolean | null;
    new?: string | number | boolean | null;
}

interface AuditLog {
    _id: string;
    timestamp: string;
    action: ActionType;
    entity: string;
    entityId?: string;
    entityName?: string;
    changes?: Record<string, ChangeValue>;
    performedBy: string;
    [key: string]: unknown;
}

interface AuditLogRow extends AuditLog {
    srNo: number;
}

interface PaginationData {
    page: number;
    totalPages: number;
    total: number;
    limit: number;
}

interface AuditLogTableProps {
    logs: AuditLog[];
    pagination: PaginationData;
}

const DEFAULT_COLUMN_VISIBILITY: GridColumnVisibilityModel = {
    srNo: true,
    timestamp: true,
    action: true,
    entity: true,
    entityName: true,
    changes: true,
    performedBy: true,
};

function normalizeAuditColumnsModel(model: unknown): GridColumnVisibilityModel | null {
    if (!model || typeof model !== 'object') return null;
    // Simple pass-through for now, can add field name mapping if needed in future
    return model as GridColumnVisibilityModel;
}

function formatDate(dateStr: string | undefined): string {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatChanges(changes: Record<string, ChangeValue> | undefined): string {
    if (!changes || Object.keys(changes).length === 0) return '-';

    const entries = Object.entries(changes).slice(0, 3);
    return entries.map(([key, val]) => {
        const oldVal = val.old ?? '-';
        const newVal = val.new ?? '-';
        return `${key}: ${oldVal} -> ${newVal}`;
    }).join(', ') + (Object.keys(changes).length > 3 ? '...' : '');
}

export default function AuditLogTable({ logs, pagination }: AuditLogTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const apiRef = useGridApiRef();

    const [columnVisibility, setColumnVisibility] = useState<GridColumnVisibilityModel>(DEFAULT_COLUMN_VISIBILITY);
    const [viewDetailsLog, setViewDetailsLog] = useState<AuditLog | null>(null);
    const persistTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastQueuedVisibilityRef = useRef(JSON.stringify(DEFAULT_COLUMN_VISIBILITY));
    const lastSavedVisibilityRef = useRef(JSON.stringify(DEFAULT_COLUMN_VISIBILITY));

    // Load column visibility from settings
    useEffect(() => {
        (async () => {
            try {
                const saved = await getUiSetting('auditTableSettings');
                const model = normalizeAuditColumnsModel((saved as { columnVisibilityModel?: unknown })?.columnVisibilityModel);
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

    // Persist column visibility with debouncing
    const queuePersistColumns = (next: GridColumnVisibilityModel) => {
        setColumnVisibility(next);
        const json = JSON.stringify(next);
        lastQueuedVisibilityRef.current = json;
        if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        persistTimerRef.current = setTimeout(async () => {
            if (lastSavedVisibilityRef.current === json) return;
            if (lastQueuedVisibilityRef.current !== json) return;
            try {
                await setUiSetting('auditTableSettings', { columnVisibilityModel: next }, 'general');
                lastSavedVisibilityRef.current = json;
            } catch {
                // ignore
            }
        }, 600);
    };

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        };
    }, []);

    // Transform logs to rows with serial numbers
    const rows: AuditLogRow[] = useMemo(() => {
        return logs.map((log, idx) => ({
            ...log,
            srNo: idx + 1 + (pagination.page - 1) * pagination.limit,
        }));
    }, [logs, pagination.page, pagination.limit]);

    // Column definitions
    const columns: GridColDef[] = useMemo(() => {
        return [
            {
                field: 'srNo',
                headerName: 'Sr No',
                width: 80,
                sortable: false,
                filterable: false,
                headerAlign: 'center',
                align: 'center',
            },
            {
                field: 'timestamp',
                headerName: 'Timestamp',
                flex: 1,
                minWidth: 160,
                valueGetter: (value) => formatDate(value as string),
            },
            {
                field: 'action',
                headerName: 'Action',
                flex: 0.8,
                minWidth: 120,
                renderCell: (params: GridRenderCellParams) => {
                    const config = actionConfig[params.value as ActionType] || actionConfig.update;
                    const ActionIcon = config.icon;
                    return (
                        <Chip
                            icon={<ActionIcon sx={{ fontSize: 16 }} />}
                            label={config.label}
                            size="small"
                            sx={{
                                bgcolor: config.bgcolor,
                                color: config.color,
                                '& .MuiChip-icon': { color: config.color },
                            }}
                        />
                    );
                },
            },
            {
                field: 'entity',
                headerName: 'Entity',
                flex: 0.7,
                minWidth: 100,
                headerAlign: 'center',
                align: 'center',
                renderCell: (params: GridRenderCellParams) => (
                    <Chip
                        label={entityLabels[params.value as string] || params.value}
                        size="small"
                        variant="outlined"
                    />
                ),
            },
            {
                field: 'entityName',
                headerName: 'Name',
                flex: 1.2,
                minWidth: 180,
                renderCell: (params: GridRenderCellParams) => {
                    const value = params.value || '-';
                    return (
                        <Tooltip title={value}>
                            <span
                                style={{
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    maxWidth: '100%',
                                }}
                            >
                                {value}
                            </span>
                        </Tooltip>
                    );
                },
            },
            {
                field: 'changes',
                headerName: 'Changes',
                flex: 1.5,
                minWidth: 200,
                renderCell: (params: GridRenderCellParams) => {
                    const changesText = formatChanges(params.value as Record<string, ChangeValue> | undefined);
                    return (
                        <Tooltip title={changesText}>
                            <span
                                style={{
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    maxWidth: '100%',
                                    fontSize: '0.75rem',
                                    color: '#64748b',
                                }}
                            >
                                {changesText}
                            </span>
                        </Tooltip>
                    );
                },
            },
            {
                field: 'performedBy',
                headerName: 'Performed By',
                flex: 1,
                minWidth: 150,
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
                        <Tooltip title="View Details">
                            <IconButton
                                size="small"
                                onClick={() => {
                                    setViewDetailsLog(params.row as AuditLog);
                                }}
                            >
                                <VisibilityIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                ),
            },
        ];
    }, []);

    // Handle pagination changes
    const handlePaginationModelChange = (model: GridPaginationModel) => {
        const newPage = model.page + 1; // DataGrid uses 0-indexed pages, backend uses 1-indexed
        if (newPage !== pagination.page) {
            const params = new URLSearchParams(searchParams.toString());
            params.set('page', newPage.toString());
            router.push(`/dashboard/audit?${params.toString()}`);
        }
    };

    // GridToolbar component
    function GridToolbar() {
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
                        csvOptions={{ fileName: 'audit-log', utf8WithBom: true }}
                        printOptions={{ disableToolbarButton: true }}
                        slotProps={{ button: { size: 'small' } }}
                    />
                </Box>
            </GridToolbarContainer>
        );
    }

    // Render changes detail section
    const renderChangesDetail = (changes: Record<string, ChangeValue> | undefined) => {
        if (!changes || Object.keys(changes).length === 0) {
            return (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                    No changes recorded
                </Typography>
            );
        }

        return (
            <Stack spacing={1.5}>
                {Object.entries(changes).map(([field, value]) => {
                    const oldVal = value.old ?? 'empty';
                    const newVal = value.new ?? 'empty';
                    const oldStr = String(oldVal);
                    const newStr = String(newVal);

                    // Use chips for short values, text for long values
                    const useChips = oldStr.length < 50 && newStr.length < 50;

                    return (
                        <Box key={field}>
                            <Typography variant="subtitle2" fontWeight={600} color="text.secondary" sx={{ mb: 0.5 }}>
                                {field}
                            </Typography>
                            {useChips ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                    <Chip
                                        label={oldStr}
                                        size="small"
                                        variant="outlined"
                                        sx={{
                                            bgcolor: '#fff',
                                            borderColor: '#e5e7eb',
                                            color: '#6b7280',
                                        }}
                                    />
                                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                                        →
                                    </Typography>
                                    <Chip
                                        label={newStr}
                                        size="small"
                                        variant="outlined"
                                        sx={{
                                            bgcolor: '#eff6ff',
                                            borderColor: '#93c5fd',
                                            color: '#1e40af',
                                        }}
                                    />
                                </Box>
                            ) : (
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                    <Box>
                                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                                            Previous:
                                        </Typography>
                                        <Typography
                                            variant="body2"
                                            sx={{
                                                mt: 0.25,
                                                p: 1,
                                                bgcolor: '#f9fafb',
                                                borderRadius: 1,
                                                fontFamily: 'monospace',
                                                fontSize: '0.813rem',
                                                wordBreak: 'break-word',
                                            }}
                                        >
                                            {oldStr}
                                        </Typography>
                                    </Box>
                                    <Box>
                                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                                            Current:
                                        </Typography>
                                        <Typography
                                            variant="body2"
                                            sx={{
                                                mt: 0.25,
                                                p: 1,
                                                bgcolor: '#eff6ff',
                                                borderRadius: 1,
                                                fontFamily: 'monospace',
                                                fontSize: '0.813rem',
                                                wordBreak: 'break-word',
                                            }}
                                        >
                                            {newStr}
                                        </Typography>
                                    </Box>
                                </Box>
                            )}
                        </Box>
                    );
                })}
            </Stack>
        );
    };

    return (
        <Box>
            {logs.length === 0 ? (
                <Box sx={{ py: 6, textAlign: 'center', bgcolor: '#f8fafc', borderRadius: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                        No audit logs found
                    </Typography>
                </Box>
            ) : (
                <StandardDataGrid
                    apiRef={apiRef}
                    rows={rows}
                    columns={columns}
                    getRowId={(row) => row._id}
                    autoHeight
                    paginationMode="server"
                    rowCount={pagination.total}
                    paginationModel={{
                        page: pagination.page - 1, // DataGrid uses 0-indexed
                        pageSize: pagination.limit,
                    }}
                    onPaginationModelChange={handlePaginationModelChange}
                    pageSizeOptions={[10, 25, 50]}
                    columnVisibilityModel={columnVisibility}
                    onColumnVisibilityModelChange={queuePersistColumns}
                    slots={{ toolbar: GridToolbar }}
                    sx={{ minWidth: 'fit-content' }}
                />
            )}

            {/* View Details Dialog */}
            <Dialog
                open={!!viewDetailsLog}
                onClose={() => setViewDetailsLog(null)}
                maxWidth="md"
                fullWidth
                aria-labelledby="audit-log-details-title"
            >
                <DialogTitle id="audit-log-details-title" sx={{ pb: 1 }}>
                    <Typography variant="h6" component="div" fontWeight={600}>
                        Audit Log Details
                    </Typography>
                </DialogTitle>
                <DialogContent dividers sx={{ py: 3 }}>
                    <Stack spacing={2.5}>
                        {/* Timestamp */}
                        <Box>
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                Timestamp
                            </Typography>
                            <Typography variant="body1" fontWeight={500}>
                                {formatDate(viewDetailsLog?.timestamp)}
                            </Typography>
                        </Box>

                        {/* Action */}
                        <Box>
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                Action
                            </Typography>
                            {viewDetailsLog && (() => {
                                const config = actionConfig[viewDetailsLog.action] || actionConfig.update;
                                const ActionIcon = config.icon;
                                return (
                                    <Chip
                                        icon={<ActionIcon sx={{ fontSize: 18 }} />}
                                        label={config.label}
                                        sx={{
                                            bgcolor: config.bgcolor,
                                            color: config.color,
                                            '& .MuiChip-icon': { color: config.color },
                                            fontWeight: 500,
                                        }}
                                    />
                                );
                            })()}
                        </Box>

                        {/* Entity Type */}
                        <Box>
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                Entity Type
                            </Typography>
                            <Chip
                                label={entityLabels[viewDetailsLog?.entity || ''] || viewDetailsLog?.entity || '-'}
                                variant="outlined"
                                sx={{ fontWeight: 500 }}
                            />
                        </Box>

                        {/* Entity Name */}
                        <Box>
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                Entity Name
                            </Typography>
                            <Typography variant="body1">
                                {viewDetailsLog?.entityName || '-'}
                            </Typography>
                        </Box>

                        {/* Performed By */}
                        <Box>
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                Performed By
                            </Typography>
                            <Typography variant="body1" fontWeight={500}>
                                {viewDetailsLog?.performedBy || '-'}
                            </Typography>
                        </Box>

                        <Divider sx={{ my: 1 }} />

                        {/* Changes */}
                        <Box>
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ mb: 1.5 }}>
                                Changes
                            </Typography>
                            <Paper
                                variant="outlined"
                                sx={{
                                    p: 2,
                                    bgcolor: '#f9fafb',
                                    maxHeight: 400,
                                    overflow: 'auto',
                                    borderColor: '#e5e7eb',
                                }}
                            >
                                {renderChangesDetail(viewDetailsLog?.changes)}
                            </Paper>
                        </Box>
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button
                        onClick={() => setViewDetailsLog(null)}
                        variant="contained"
                        sx={{ minWidth: 100 }}
                    >
                        Close
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
