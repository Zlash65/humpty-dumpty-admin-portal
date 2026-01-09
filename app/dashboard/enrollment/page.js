import { getAcademicYears } from '@/app/actions/academicYear';
import { getStudents } from '@/app/actions/student';
import { getEnrollments } from '@/app/actions/enrollment';
import EnrollStudentForm from './EnrollStudentForm';
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

export default async function EnrollmentPage({ searchParams }) {
    const years = await getAcademicYears();
    const students = await getStudents();

    const { yearId } = await searchParams;
    const selectedYearId = yearId || (years.length > 0 ? years[0]._id : null);

    const enrollments = selectedYearId ? await getEnrollments(selectedYearId) : [];
    const selectedYearName = years.find(y => y._id === selectedYearId)?.name || 'None';

    return (
        <Box>
            <Typography variant="h4" gutterBottom fontWeight="bold">Enrollment Management</Typography>

            <Paper sx={{ p: 3, mb: 4 }}>
                <Typography variant="h6" gutterBottom>Enroll Student</Typography>
                <EnrollStudentForm years={years} students={students} defaultYearId={selectedYearId} />
            </Paper>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, mt: 4 }}>
                <Typography variant="h5">Class Lists</Typography>
                <Chip label={`Viewing: ${selectedYearName}`} color="primary" variant="outlined" />
            </Box>

            {enrollments.length === 0 ? (
                <Typography color="text.secondary">No enrollments found for this year.</Typography>
            ) : (
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Class</TableCell>
                                <TableCell>Section</TableCell>
                                <TableCell>Roll No</TableCell>
                                <TableCell>Admission No</TableCell>
                                <TableCell>Name</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {enrollments.map((enr) => (
                                <TableRow key={enr._id}>
                                    <TableCell>{enr.class}</TableCell>
                                    <TableCell>{enr.section}</TableCell>
                                    <TableCell>{enr.rollNumber}</TableCell>
                                    <TableCell>{enr.studentId.admissionNumber}</TableCell>
                                    <TableCell>{enr.studentId.firstName} {enr.studentId.lastName}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </Box>
    );
}
