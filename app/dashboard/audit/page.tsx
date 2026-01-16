import { getAuditLogsPage } from '@/app/actions/audit';
import AuditLogTable from './AuditLogTable';
import {
    Box,
    Typography,
    Paper,
} from '@mui/material';

export default async function AuditPage() {
    const result = await getAuditLogsPage({
        page: 0,
        pageSize: 50,
        sortModel: [{ field: 'timestamp', sort: 'desc' }],
    });

    const initialLogs = JSON.parse(JSON.stringify(result.rows));
    const initialRowCount = Number(result.total) || 0;

    return (
        <Box>
            <Typography variant="h4" gutterBottom fontWeight="bold">Audit Log</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Track all changes and activities in the system
            </Typography>

            <Paper sx={{ p: 3 }}>
                <AuditLogTable initialLogs={initialLogs} initialRowCount={initialRowCount} />
            </Paper>
        </Box>
    );
}
