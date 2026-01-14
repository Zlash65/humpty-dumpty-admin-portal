import { Box } from '@mui/material';
import TableSkeleton, { PageHeaderSkeleton } from '@/components/ui/TableSkeleton';

export default function FeesLoading() {
    return (
        <Box>
            <PageHeaderSkeleton />
            <TableSkeleton rows={10} columns={6} />
        </Box>
    );
}
