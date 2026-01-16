import { Box } from '@mui/material';
import TableSkeleton, { PageHeaderSkeleton } from '@/components/ui/TableSkeleton';

export default function ClassesLoading() {
    return (
        <Box>
            <PageHeaderSkeleton />
            <TableSkeleton rows={10} columns={5} />
        </Box>
    );
}

