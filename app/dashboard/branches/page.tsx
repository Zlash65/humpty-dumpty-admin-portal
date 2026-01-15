import { getBranches } from '@/app/actions/branch';
import CreateBranchForm from './CreateBranchForm';
import BranchTable from './BranchTable';
import {
    Box,
    Typography,
    Paper,
} from '@mui/material';

export default async function BranchesPage() {
    const branchesData = await getBranches(true); // Include inactive for management

    // Serialize MongoDB documents to plain objects for Client Components
    const branches = JSON.parse(JSON.stringify(branchesData));

    return (
        <Box sx={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
            <Typography variant="h4" gutterBottom fontWeight="bold">Branches</Typography>

            <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 4, width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
                <Typography variant="h6" gutterBottom>Add New Branch</Typography>
                <CreateBranchForm />
            </Paper>

            <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>Branch Directory</Typography>

            <BranchTable branches={branches} />
        </Box>
    );
}
