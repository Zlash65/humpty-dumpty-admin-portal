'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    Typography,
    Chip,
    Box,
    Paper,
    Alert,
    Button,
    IconButton,
    Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Stack,
    Divider,
    TextField,
    CircularProgress,
    InputAdornment,
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
    useGridApiRef,
} from '@mui/x-data-grid';
import { getUiSetting, setUiSetting } from '@/app/actions/uiSettings';
import { getAuditLogsPage } from '@/app/actions/audit';
import StandardDataGrid from '@/components/StandardDataGrid';
import useServerPaginatedGrid from '@/components/ui/grid/useServerPaginatedGrid';
import ExportAllCsvButton from '@/components/ui/grid/ExportAllCsvButton';
import { auditExtractChangeRows, auditFormatChangesInline } from '@/lib/auditFormat';

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

interface AuditLog {
    _id: string;
    timestamp?: string;
    action: string;
    entity: string;
    entityId?: string;
    entityName?: string;
    changes?: unknown;
    performedBy: string;
}

interface AuditLogRow extends AuditLog {
    srNo: number;
}

interface AuditLogTableProps {
    initialLogs: AuditLog[];
    initialRowCount: number;
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

function formatChanges(changes: unknown): string {
    const inline = auditFormatChangesInline(changes, { maxFields: 3 });
    return inline || '-';
}

const DETAILS_FIELD_ORDER = [
    'schoolName',
    'schoolTagline',
    'address',
    'phone',
    'phone2',
    'phone3',
    'email',
    'logoUrl',
] as const;

const DETAILS_FIELD_LABELS: Record<string, string> = {
    schoolName: 'School Name',
    schoolTagline: 'School Tagline',
    address: 'Address',
    phone: 'Phone',
    phone2: 'Phone 2',
    phone3: 'Phone 3',
    email: 'Email',
    logoUrl: 'Logo URL',
};

function titleCaseFromKey(value: string): string {
    const s = String(value || '').trim();
    if (!s) return '';
    const normalized = s
        .replace(/[_-]+/g, ' ')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim();
    return normalized
        .split(' ')
        .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
        .join(' ');
}

function fieldLabel(field: string): string {
    return DETAILS_FIELD_LABELS[field] || titleCaseFromKey(field) || field;
}

export default function AuditLogTable({ initialLogs, initialRowCount }: AuditLogTableProps) {
    const apiRef = useGridApiRef();

    const [query, setQuery] = useState('');
    const [exportError, setExportError] = useState<string | null>(null);
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

    const fetchAuditPage = useCallback(
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
            const res = await getAuditLogsPage({ page, pageSize, search, sortModel, filterModel });
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
    } = useServerPaginatedGrid<AuditLog>({
        initialRows: initialLogs,
        initialRowCount,
        initialPaginationModel: { page: 0, pageSize: 50 },
        initialSortModel: [{ field: 'timestamp', sort: 'desc' }],
        query,
        minChars: 2,
        debounceMs: 300,
        fetchPage: fetchAuditPage,
    });

    const gridRows: AuditLogRow[] = useMemo(() => {
        const baseIndex = paginationModel.page * paginationModel.pageSize;
        return (rows || []).map((log, idx) => ({
            ...log,
            srNo: baseIndex + idx + 1,
        }));
    }, [paginationModel.page, paginationModel.pageSize, rows]);

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
                    const changesText = formatChanges(params.value);
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

    // GridToolbar component
    function GridToolbar() {
        const fileName = `audit-log-${new Date().toISOString().slice(0, 10)}`;
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
                        entity="audit"
                        filename={fileName}
                        disabled={loading}
                        payload={{
                            search: effectiveSearch,
                            sortModel,
                            filterModel,
                        }}
                        onError={(msg) => setExportError(msg)}
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

    // Render changes detail section
    const renderChangesDetail = (changes: unknown) => {
        const baseRows = auditExtractChangeRows(changes);
        const orderIndex = new Map<string, number>(DETAILS_FIELD_ORDER.map((f, i) => [f, i]));
        const rows = baseRows
            .map((r, idx) => ({ r, idx, rank: orderIndex.has(r.field) ? (orderIndex.get(r.field) as number) : Number.POSITIVE_INFINITY }))
            .sort((a, b) => (a.rank - b.rank) || (a.idx - b.idx))
            .map((x) => x.r);

        if (!rows.length) {
            return (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                    No changes recorded
                </Typography>
            );
        }

        const changeRows = rows.map((r) => ({
            id: r.field,
            field: fieldLabel(r.field),
            old: r.old,
            new: r.new,
        }));

        const changeColumns: GridColDef[] = [
            {
                field: 'field',
                headerName: 'Field',
                flex: 0.8,
                minWidth: 160,
                sortable: false,
                filterable: false,
                renderCell: (params: GridRenderCellParams) => (
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#334155' }}>
                        {String(params.value || '')}
                    </Typography>
                ),
            },
            {
                field: 'old',
                headerName: 'Old',
                flex: 1,
                minWidth: 220,
                sortable: false,
                filterable: false,
                renderCell: (params: GridRenderCellParams) => (
                    <Tooltip title={String(params.value ?? '')}>
                        <Box sx={{ width: '100%' }}>
                            <Typography
                                variant="body2"
                                sx={{
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    lineHeight: 1.35,
                                    color: 'text.secondary',
                                }}
                            >
                                {String(params.value ?? '')}
                            </Typography>
                        </Box>
                    </Tooltip>
                ),
            },
            {
                field: 'new',
                headerName: 'New',
                flex: 1,
                minWidth: 220,
                sortable: false,
                filterable: false,
                renderCell: (params: GridRenderCellParams) => (
                    <Tooltip title={String(params.value ?? '')}>
                        <Box sx={{ width: '100%' }}>
                            <Typography
                                variant="body2"
                                sx={{
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    lineHeight: 1.35,
                                    color: 'primary.main',
                                }}
                            >
                                {String(params.value ?? '')}
                            </Typography>
                        </Box>
                    </Tooltip>
                ),
            },
        ];

        return (
            <StandardDataGrid
                rows={changeRows}
                columns={changeColumns}
                getRowId={(row) => row.id}
                autoHeight
                hideFooter
                disableRowSelectionOnClick
                disableColumnFilter
                disableDensitySelector
                disableColumnSelector
                getRowHeight={() => 'auto'}
                paperSx={{ p: { xs: 0.5, sm: 1 }, maxHeight: 400 }}
                sx={{
                    '& .MuiDataGrid-cell': { py: 1, alignItems: 'stretch' },
                    '& .MuiDataGrid-cellContent': { whiteSpace: 'normal', lineHeight: 1.35 },
                }}
            />
        );
    };

    return (
        <Box>
            {exportError && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setExportError(null)}>
                    {exportError}
                </Alert>
            )}
            <Paper sx={{ p: { xs: 1.5, sm: 2 }, mb: 2, width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
                <TextField
                    id="audit-search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by entity, name, performed by (min 2 chars)..."
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
                stickyActionsField="__actions"
                paginationMode="server"
                rowCount={rowCount}
                paginationModel={paginationModel}
                onPaginationModelChange={setPaginationModel}
                pageSizeOptions={[25, 50, 100]}
                sortingMode="server"
                sortModel={sortModel}
                onSortModelChange={onSortModelChange}
                filterMode="server"
                filterModel={filterModel}
                onFilterModelChange={onFilterModelChange}
                columnVisibilityModel={columnVisibility}
                onColumnVisibilityModelChange={queuePersistColumns}
                slots={{ toolbar: GridToolbar }}
                sx={{ minWidth: 'fit-content' }}
            />

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
                    <Box
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', md: 'repeat(12, 1fr)' },
                            gap: 2,
                        }}
                    >
                        <Box sx={{ gridColumn: { xs: '1 / -1', md: 'span 4' } }}>
                            <TextField
                                label="Timestamp"
                                value={formatDate(viewDetailsLog?.timestamp)}
                                size="small"
                                fullWidth
                                InputProps={{ readOnly: true }}
                            />
                        </Box>

                        <Box sx={{ gridColumn: { xs: '1 / -1', md: 'span 4' } }}>
                            {(() => {
                                const config = actionConfig[viewDetailsLog?.action as ActionType] || actionConfig.update;
                                const ActionIcon = config.icon;
                                return (
                                    <TextField
                                        label="Action"
                                        value={config.label}
                                        size="small"
                                        fullWidth
                                        InputProps={{
                                            readOnly: true,
                                            startAdornment: (
                                                <InputAdornment position="start">
                                                    <ActionIcon sx={{ fontSize: 18, color: config.color }} />
                                                </InputAdornment>
                                            ),
                                        }}
                                    />
                                );
                            })()}
                        </Box>

                        <Box sx={{ gridColumn: { xs: '1 / -1', md: 'span 4' } }}>
                            <TextField
                                label="Entity Type"
                                value={entityLabels[viewDetailsLog?.entity || ''] || viewDetailsLog?.entity || '-'}
                                size="small"
                                fullWidth
                                InputProps={{ readOnly: true }}
                            />
                        </Box>

                        <Box sx={{ gridColumn: { xs: '1 / -1', md: 'span 8' } }}>
                            <TextField
                                label="Entity Name"
                                value={viewDetailsLog?.entityName || '-'}
                                size="small"
                                fullWidth
                                InputProps={{ readOnly: true }}
                            />
                        </Box>

                        <Box sx={{ gridColumn: { xs: '1 / -1', md: 'span 4' } }}>
                            <TextField
                                label="Performed By"
                                value={viewDetailsLog?.performedBy || '-'}
                                size="small"
                                fullWidth
                                InputProps={{ readOnly: true }}
                            />
                        </Box>

                        <Box sx={{ gridColumn: '1 / -1' }}>
                            <Divider sx={{ my: 0.5 }} />
                        </Box>

                        <Box sx={{ gridColumn: '1 / -1' }}>
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ mb: 1.5 }}>
                                Changes
                            </Typography>
                            {renderChangesDetail(viewDetailsLog?.changes)}
                        </Box>
                    </Box>
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
