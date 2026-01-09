import { getStudents } from '@/app/actions/student';
import CreateStudentForm from './CreateStudentForm';
import {
    Box,
    Typography,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow
} from '@mui/material';

export default async function StudentsPage() {
    const students = await getStudents();

    return (
        <Box>
            <Typography variant="h4" gutterBottom fontWeight="bold">Students</Typography>

            <Paper sx={{ p: 3, mb: 4 }}>
                <Typography variant="h6" gutterBottom>Admission</Typography>
                <CreateStudentForm />
            </Paper>

            <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>Student Directory</Typography>

            {students.length === 0 ? (
                <Typography color="text.secondary">No students found.</Typography>
            ) : (
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Admission No</TableCell>
                                <TableCell>Name</TableCell>
                                <TableCell>Gender</TableCell>
                                <TableCell>DOB</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {students.map((student) => (
                                <TableRow key={student._id}>
                                    <TableCell>{student.admissionNumber}</TableCell>
                                    <TableCell>{student.firstName} {student.lastName}</TableCell>
                                    <TableCell>{student.gender}</TableCell>
                                    <TableCell>{new Date(student.dob).toLocaleDateString()}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </Box>
    );
}
