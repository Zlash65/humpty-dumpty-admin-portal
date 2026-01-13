'use client';

import { useState } from 'react';
import { deleteStudent } from '@/app/actions/student';
import {
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    IconButton,
    Typography,
    Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Alert,
    Chip,
    Box
} from '@mui/material';
import { Edit, Delete, Visibility, Phone } from '@mui/icons-material';
import EditStudentModal from './EditStudentModal';
import ViewStudentModal from './ViewStudentModal';

// Format date consistently to avoid hydration mismatch
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

export default function StudentTable({ students }) {
    const [editStudent, setEditStudent] = useState(null);
    const [viewStudent, setViewStudent] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [message, setMessage] = useState(null);

    const handleDelete = async () => {
        if (!deleteConfirm) return;
        const res = await deleteStudent(deleteConfirm._id);
        if (res.error) {
            setMessage({ type: 'error', text: res.error });
        } else {
            setMessage({ type: 'success', text: 'Student removed successfully' });
        }
        setDeleteConfirm(null);
    };

    if (students.length === 0) {
        return (
            <Typography color="text.secondary" sx={{ mt: 2 }}>
                No students found.
            </Typography>
        );
    }

    return (
        <>
            {message && (
                <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
                    {message.text}
                </Alert>
            )}

            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow sx={{ bgcolor: 'grey.100' }}>
                            <TableCell>Admission No</TableCell>
                            <TableCell>Name</TableCell>
                            <TableCell>Gender</TableCell>
                            <TableCell>DOB</TableCell>
                            <TableCell>Parent Contact</TableCell>
                            <TableCell>Branch</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {students.map((student) => (
                            <TableRow key={student._id} hover>
                                <TableCell>
                                    <Typography variant="body2" fontWeight="medium">
                                        {student.admissionNumber}
                                    </Typography>
                                </TableCell>
                                <TableCell>
                                    <Box>
                                        <Typography variant="body2">
                                            {student.firstName} {student.lastName}
                                        </Typography>
                                        {student.fatherName && (
                                            <Typography variant="caption" color="text.secondary">
                                                S/D of {student.fatherName}
                                            </Typography>
                                        )}
                                    </Box>
                                </TableCell>
                                <TableCell>{student.gender}</TableCell>
                                <TableCell>
                                    {formatDate(student.dob)}
                                </TableCell>
                                <TableCell>
                                    {student.parentContact1 ? (
                                        <Chip
                                            icon={<Phone fontSize="small" />}
                                            label={student.parentContact1}
                                            size="small"
                                            variant="outlined"
                                        />
                                    ) : '-'}
                                </TableCell>
                                <TableCell>
                                    {student.branchName ? (
                                        <Chip label={student.branchName} size="small" color="primary" variant="outlined" />
                                    ) : '-'}
                                </TableCell>
                                <TableCell align="right">
                                    <Tooltip title="View Details">
                                        <IconButton size="small" onClick={() => setViewStudent(student)}>
                                            <Visibility fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Edit">
                                        <IconButton size="small" onClick={() => setEditStudent(student)}>
                                            <Edit fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Delete">
                                        <IconButton size="small" color="error" onClick={() => setDeleteConfirm(student)}>
                                            <Delete fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* View Student Modal */}
            {viewStudent && (
                <ViewStudentModal
                    student={viewStudent}
                    open={!!viewStudent}
                    onClose={() => setViewStudent(null)}
                />
            )}

            {/* Edit Student Modal */}
            {editStudent && (
                <EditStudentModal
                    student={editStudent}
                    open={!!editStudent}
                    onClose={() => setEditStudent(null)}
                />
            )}

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
                <DialogTitle>Confirm Delete</DialogTitle>
                <DialogContent>
                    Are you sure you want to remove <strong>{deleteConfirm?.firstName} {deleteConfirm?.lastName}</strong>?
                    This will mark the student as inactive.
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                    <Button onClick={handleDelete} color="error" variant="contained">
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
