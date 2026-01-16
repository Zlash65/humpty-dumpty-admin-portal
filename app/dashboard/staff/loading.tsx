import { Box } from '@mui/material';
import TableSkeleton, { PageHeaderSkeleton } from '@/components/ui/TableSkeleton';

export default function StaffLoading() {
    return (
        <Box>
            <PageHeaderSkeleton />
            <TableSkeleton rows={10} columns={5} />
        </Box>
    );
}
