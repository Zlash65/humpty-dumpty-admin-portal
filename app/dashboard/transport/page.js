import { getTransports } from '@/app/actions/transport';
import { getBranches } from '@/app/actions/branch';
import CreateTransportForm from './CreateTransportForm';
import TransportTable from './TransportTable';
import TransportSearch from './TransportSearch';
import {
    Box,
    Typography,
    Paper,
} from '@mui/material';

export default async function TransportPage({ searchParams }) {
    const params = await searchParams;
    const search = params?.search || '';
    const branchId = params?.branchId || '';

    const [transportsData, branchesData] = await Promise.all([
        getTransports({ search, branchId: branchId || undefined }),
        getBranches().catch(() => [])
    ]);

    // Serialize MongoDB documents to plain objects for Client Components
    const transports = JSON.parse(JSON.stringify(transportsData));
    const branches = JSON.parse(JSON.stringify(branchesData));

    return (
        <Box>
            <Typography variant="h4" gutterBottom fontWeight="bold">Transport Management</Typography>

            <Paper sx={{ p: 3, mb: 4 }}>
                <Typography variant="h6" gutterBottom>Add New Vehicle</Typography>
                <CreateTransportForm branches={branches} />
            </Paper>

            <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>Vehicle Directory</Typography>

            <Paper sx={{ p: 2, mb: 2 }}>
                <TransportSearch branches={branches} initialSearch={search} initialBranch={branchId} />
            </Paper>

            <TransportTable transports={transports} branches={branches} />
        </Box>
    );
}
