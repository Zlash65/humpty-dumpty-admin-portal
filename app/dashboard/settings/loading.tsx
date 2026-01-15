import { Box, Paper, Skeleton } from '@mui/material';
import { PageHeaderSkeleton } from '@/components/ui/TableSkeleton';

export default function SettingsLoading() {
    return (
        <Box>
            <PageHeaderSkeleton />
            <Paper sx={{ p: { xs: 2, sm: 3 } }}>
                <Skeleton variant="text" width={220} height={32} sx={{ mb: 2 }} />
                <Skeleton variant="rectangular" height={44} sx={{ borderRadius: 1, mb: 2 }} />
                <Skeleton variant="rectangular" height={44} sx={{ borderRadius: 1, mb: 2 }} />
                <Skeleton variant="rectangular" height={44} sx={{ borderRadius: 1, mb: 2 }} />
                <Skeleton variant="rectangular" height={44} sx={{ borderRadius: 1, mb: 2 }} />
                <Skeleton variant="rectangular" height={44} sx={{ borderRadius: 1 }} />
            </Paper>
        </Box>
    );
}

