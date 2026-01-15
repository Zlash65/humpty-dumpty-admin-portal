import { getAuditLogs } from '@/app/actions/audit';
import type { AuditEntity, AuditAction } from '@/types';
import AuditLogTable from './AuditLogTable';
import {
    Box,
    Typography,
    Paper,
} from '@mui/material';

interface PageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function AuditPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const page = parseInt(params?.page as string) || 1;
    const entity = (params?.entity as string) || '';
    const action = (params?.action as string) || '';

    const result = await getAuditLogs({
        page,
        entity: entity ? entity as AuditEntity : undefined,
        action: action ? action as AuditAction : undefined
    });

    const logs = JSON.parse(JSON.stringify(result.data));
    const pagination = {
        page: result.page,
        totalPages: result.totalPages,
        total: result.total,
        limit: 50
    };

    return (
        <Box>
            <Typography variant="h4" gutterBottom fontWeight="bold">Audit Log</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Track all changes and activities in the system
            </Typography>

            <Paper sx={{ p: 3 }}>
                <AuditLogTable logs={logs} pagination={pagination} />
            </Paper>
        </Box>
    );
}
