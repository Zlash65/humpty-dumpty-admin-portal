import { getBranches } from '@/app/actions/branch';
import { getTransports } from '@/app/actions/transport';
import { cookies } from 'next/headers';
import ElectronTransportClient from './ElectronTransportClient';
import { Box, Typography } from '@mui/material';

export default async function TransportPage({ searchParams }) {
    const _ = await searchParams;
    const cookieStore = await cookies();
    const cookieBranchId = cookieStore.get('branch_id')?.value || '';

    const [branches, transports] = await Promise.all([
        getBranches().catch(() => []),
        // Electron parity: transports are global (SQLite had no branch field)
        getTransports({}).catch(() => []),
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
        <ElectronTransportClient
            key={branchId}
            transports={transports}
            branchId={branchId}
            branchName={branchName}
        />
    );
}
