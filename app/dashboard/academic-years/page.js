import { getAcademicYears } from '@/app/actions/academicYear';
import CreateYearForm from './CreateYearForm';
import {
    Box,
    Typography,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Chip
} from '@mui/material';

export default async function AcademicYearsPage() {
    const years = await getAcademicYears();

    return (
        <Box>
            <Typography variant="h4" gutterBottom fontWeight="bold">Academic Years</Typography>

            <Paper sx={{ p: 3, mb: 4 }}>
                <Typography variant="h6" gutterBottom>Create New Year</Typography>
                <CreateYearForm />
            </Paper>

            <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>History</Typography>

            {years.length === 0 ? (
                <Typography color="text.secondary">No academic years found.</Typography>
            ) : (
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Name</TableCell>
                                <TableCell>Start Date</TableCell>
                                <TableCell>End Date</TableCell>
                                <TableCell>Status</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {years.map((year) => (
                                <TableRow key={year._id}>
                                    <TableCell>{year.name}</TableCell>
                                    <TableCell>{new Date(year.startDate).toLocaleDateString()}</TableCell>
                                    <TableCell>{new Date(year.endDate).toLocaleDateString()}</TableCell>
                                    <TableCell>
                                        {year.isActive ? (
                                            <Chip label="Active" color="success" size="small" />
                                        ) : (
                                            <Chip label="Inactive" size="small" />
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </Box>
    );
}
