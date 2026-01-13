import { getStudents } from '@/app/actions/student';
import { getBranches } from '@/app/actions/branch';
import CreateStudentForm from './CreateStudentForm';
import StudentTable from './StudentTable';
import StudentSearch from './StudentSearch';
import {
    Box,
    Typography,
    Paper,
} from '@mui/material';

export default async function StudentsPage({ searchParams }) {
    const params = await searchParams;
    const search = params?.search || '';
    const branchId = params?.branchId || '';

    const [studentsData, branchesData] = await Promise.all([
        getStudents({ search, branchId: branchId || undefined }),
        getBranches().catch(() => []) // Gracefully handle if branches not yet created
    ]);

    // Serialize MongoDB documents to plain objects for Client Components
    const students = JSON.parse(JSON.stringify(studentsData));
    const branches = JSON.parse(JSON.stringify(branchesData));

    return (
        <Box>
            <Typography variant="h4" gutterBottom fontWeight="bold">Students</Typography>

            <Paper sx={{ p: 3, mb: 4 }}>
                <Typography variant="h6" gutterBottom>Admission</Typography>
                <CreateStudentForm branches={branches} />
            </Paper>

            <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>Student Directory</Typography>

            <Paper sx={{ p: 2, mb: 2 }}>
                <StudentSearch branches={branches} initialSearch={search} initialBranch={branchId} />
            </Paper>

            <StudentTable students={students} />
        </Box>
    );
}
