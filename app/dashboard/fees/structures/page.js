import { getAcademicYears } from '@/app/actions/academicYear';
import { getFeeStructures } from '@/app/actions/feeStructure';
import { getBranches } from '@/app/actions/branch';
import CreateFeeStructureForm from './CreateFeeStructureForm';
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

export default async function FeeStructuresPage({ searchParams }) {
    const years = await getAcademicYears();
    const params = await searchParams;
    const yearId = params?.yearId;
    const branchId = params?.branchId || '';
    const selectedYearId = yearId || (years.length > 0 ? years[0]._id : null);
    const branches = await getBranches().catch(() => []);
    const selectedBranchId = branchId || (branches.length > 0 ? branches[0]._id : '');

    const structures = selectedYearId ? await getFeeStructures(selectedYearId, selectedBranchId || null) : [];
    const selectedYearName = years.find(y => y._id === selectedYearId)?.name || 'None';
    const selectedBranchName = branches.find(b => b._id === selectedBranchId)?.name || 'All';

    return (
        <Box>
            <Typography variant="h4" gutterBottom fontWeight="bold">Fee Structures</Typography>

            <Paper sx={{ p: 3, mb: 4 }}>
                <Typography variant="h6" gutterBottom>Set Class Fees</Typography>
                <CreateFeeStructureForm
                    years={years}
                    branches={branches}
                    defaultYearId={selectedYearId}
                    defaultBranchId={selectedBranchId}
                />
            </Paper>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, mt: 4 }}>
                <Typography variant="h5">Defined Structures</Typography>
                <Chip label={`Year: ${selectedYearName} • Branch: ${selectedBranchName}`} color="primary" variant="outlined" />
            </Box>

            {structures.length === 0 ? (
                <Typography color="text.secondary">No fee structures defined for this year.</Typography>
            ) : (
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Class</TableCell>
                                <TableCell>Shift</TableCell>
                                <TableCell>Term 1</TableCell>
                                <TableCell>Term 2</TableCell>
                                <TableCell>Book Fee</TableCell>
                                <TableCell>Total</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {structures.map((s) => (
                                <TableRow key={s._id}>
                                    <TableCell>{s.class}</TableCell>
                                    <TableCell>{s.shiftName || '-'}</TableCell>
                                    <TableCell>{s.components.term1}</TableCell>
                                    <TableCell>{s.components.term2}</TableCell>
                                    <TableCell>{s.components.bookFee}</TableCell>
                                    <TableCell>
                                        <strong>{s.components.term1 + s.components.term2 + s.components.bookFee}</strong>
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
