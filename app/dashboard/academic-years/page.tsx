import { getAcademicYears } from '@/app/actions/academicYear';
import CreateYearForm from './CreateYearForm';
import AcademicYearTable from './AcademicYearTable';
import {
    Box,
    Typography,
    Paper,
} from '@mui/material';

export default async function AcademicYearsPage() {
    const yearsData = await getAcademicYears();

    // Serialize MongoDB documents to plain objects for Client Components
    const years = JSON.parse(JSON.stringify(yearsData));

    return (
        <Box sx={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
            <Typography variant="h4" gutterBottom fontWeight="bold">Academic Years</Typography>

            <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 4, width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
                <Typography variant="h6" gutterBottom>Create New Year</Typography>
                <CreateYearForm />
            </Paper>

            <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>History</Typography>

            <AcademicYearTable years={years} />
        </Box>
    );
}
