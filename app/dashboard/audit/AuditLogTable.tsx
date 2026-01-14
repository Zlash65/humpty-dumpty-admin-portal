'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import {
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
    Chip,
    Box,
    FormControl,
    Select,
    MenuItem,
    InputLabel,
    SelectChangeEvent,
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Login as LoginIcon,
    Logout as LogoutIcon,
} from '@mui/icons-material';
import { SvgIconComponent } from '@mui/icons-material';
import Pagination from '@/components/ui/Pagination';
import ExportButton from '@/components/ExportButton';

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

    const handlePageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('page', newPage.toString());
        router.push(`/dashboard/audit?${params.toString()}`);
    };

    const handleFilterChange = (key: string, value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) {
            params.set(key, value);
        } else {
            params.delete(key);
        }
        params.set('page', '1');
        router.push(`/dashboard/audit?${params.toString()}`);
    };

    const currentEntity = searchParams.get('entity') || '';
    const currentAction = searchParams.get('action') || '';

    return (
        <Box>
            <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                <FormControl size="small" sx={{ minWidth: 150 }}>
                    <InputLabel>Entity</InputLabel>
                    <Select
                        value={currentEntity}
                        label="Entity"
                        onChange={(e: SelectChangeEvent) => handleFilterChange('entity', e.target.value)}
                    >
                        <MenuItem value="">All</MenuItem>
                        {Object.entries(entityLabels).map(([key, label]) => (
                            <MenuItem key={key} value={key}>{label}</MenuItem>
                        ))}
                    </Select>
                </FormControl>

                <FormControl size="small" sx={{ minWidth: 150 }}>
                    <InputLabel>Action</InputLabel>
                    <Select
                        value={currentAction}
                        label="Action"
                        onChange={(e: SelectChangeEvent) => handleFilterChange('action', e.target.value)}
                    >
                        <MenuItem value="">All</MenuItem>
                        <MenuItem value="create">Created</MenuItem>
                        <MenuItem value="update">Updated</MenuItem>
                        <MenuItem value="delete">Deleted</MenuItem>
                        <MenuItem value="login">Login</MenuItem>
                        <MenuItem value="logout">Logout</MenuItem>
                    </Select>
                </FormControl>

                <Box sx={{ flex: 1 }} />
                <ExportButton
                    data={logs}
                    filename={`audit_log_page_${pagination?.page || 1}`}
                    columns={[
                        { key: 'timestamp', label: 'Timestamp' },
                        { key: 'action', label: 'Action' },
                        { key: 'entity', label: 'Entity' },
                        { key: 'entityName', label: 'Entity Name' },
                        { key: 'performedBy', label: 'Performed By' },
                    ]}
                />
            </Box>

            {logs.length === 0 ? (
                <Box sx={{ py: 6, textAlign: 'center', bgcolor: '#f8fafc', borderRadius: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                        No audit logs found
                    </Typography>
                </Box>
            ) : (
                <>
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow sx={{ bgcolor: 'grey.100' }}>
                                    <TableCell>Timestamp</TableCell>
                                    <TableCell>Action</TableCell>
                                    <TableCell>Entity</TableCell>
                                    <TableCell>Name</TableCell>
                                    <TableCell>Changes</TableCell>
                                    <TableCell>Performed By</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {logs.map((log) => {
                                    const config = actionConfig[log.action] || actionConfig.update;
                                    const ActionIcon = config.icon;

                                    return (
                                        <TableRow key={log._id} hover>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {formatDate(log.timestamp)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
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
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={entityLabels[log.entity] || log.entity}
                                                    size="small"
                                                    variant="outlined"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {log.entityName || '-'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="caption" sx={{ color: '#64748b' }}>
                                                    {formatChanges(log.changes)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {log.performedBy}
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>

                    <Pagination
                        page={pagination.page}
                        totalPages={pagination.totalPages}
                        totalItems={pagination.total}
                        itemsPerPage={pagination.limit}
                        onPageChange={handlePageChange}
                        showItemsPerPage={false}
                    />
                </>
            )}
        </Box>
    );
}
