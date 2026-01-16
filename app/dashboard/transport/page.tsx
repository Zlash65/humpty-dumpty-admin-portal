import { getBranches } from '@/app/actions/branch';
import { getTransportsPage } from '@/app/actions/transport';
import { cookies } from 'next/headers';
import TransportClient from './TransportClient';
import { Box, Typography } from '@mui/material';

interface PageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function TransportPage({ searchParams }: PageProps) {
    const _params = await searchParams;
    void _params; // Consume to satisfy Next.js 15 async searchParams requirement
    const cookieStore = await cookies();
    const cookieBranchId = cookieStore.get('branch_id')?.value || '';

    const [branches, transportsPage] = await Promise.all([
        getBranches().catch(() => []),
        // Electron parity: transports are global (SQLite had no branch field)
        getTransportsPage({ page: 0, pageSize: 10 }).catch(() => ({ rows: [], total: 0 })),
    ]);

    const branchId =
        (branches || []).some((b) => String(b._id) === String(cookieBranchId))
            ? cookieBranchId
            : (branches?.[0]?._id || '');

    if (!branchId) {
        return (
            <Box>
                <Typography variant="h4" fontWeight="bold">Transport</Typography>
                <Typography color="text.secondary" sx={{ mt: 1 }}>
                    Please create at least one Branch first.
                </Typography>
            </Box>
        );
    }

    const branchName = (branches || []).find((b) => String(b._id) === String(branchId))?.name || '';

    return (
        <TransportClient
            key={branchId}
            initialTransports={transportsPage.rows}
            initialTransportRowCount={transportsPage.total}
            branchId={branchId}
            branchName={branchName}
        />
    );
}
