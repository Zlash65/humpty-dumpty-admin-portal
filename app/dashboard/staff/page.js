import { getStaff } from '@/app/actions/staff';
import { getBranches } from '@/app/actions/branch';
import CreateStaffForm from './CreateStaffForm';
import StaffTable from './StaffTable';
import StaffSearch from './StaffSearch';
import {
    Box,
    Typography,
    Paper,
} from '@mui/material';

export default async function StaffPage({ searchParams }) {
    const params = await searchParams;
    const search = params?.search || '';
    const branchId = params?.branchId || '';
    const staffType = params?.staffType || '';

    const [staffData, branchesData] = await Promise.all([
        getStaff({
            search,
            branchId: branchId || undefined,
            staffType: staffType || undefined
        }),
        getBranches().catch(() => [])
    ]);

    // Serialize MongoDB documents to plain objects for Client Components
    const staff = JSON.parse(JSON.stringify(staffData));
    const branches = JSON.parse(JSON.stringify(branchesData));

    return (
        <Box>
            <Typography variant="h4" gutterBottom fontWeight="bold">Staff Management</Typography>

            <Paper sx={{ p: 3, mb: 4 }}>
                <Typography variant="h6" gutterBottom>Add New Staff</Typography>
                <CreateStaffForm branches={branches} />
            </Paper>

            <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>Staff Directory</Typography>

            <Paper sx={{ p: 2, mb: 2 }}>
                <StaffSearch
                    branches={branches}
                    initialSearch={search}
                    initialBranch={branchId}
                    initialType={staffType}
                />
            </Paper>

            <StaffTable staff={staff} branches={branches} />
        </Box>
    );
}
