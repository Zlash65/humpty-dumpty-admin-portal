import { cookies } from 'next/headers';
import { getBranches } from '@/app/actions/branch';
import { getAcademicYears } from '@/app/actions/academicYear';
import { getFeeStructures } from '@/app/actions/feeStructure';
import ElectronClassesClient from './ElectronClassesClient';
import { Box, Typography } from '@mui/material';

export default async function ClassesPage({ searchParams }) {
    const _ = await searchParams;
    const cookieStore = await cookies();
    const cookieBranchId = cookieStore.get('branch_id')?.value || '';
    const cookieYearId = cookieStore.get('academic_year_id')?.value || '';

    const [branches, years] = await Promise.all([
        getBranches().catch(() => []),
        getAcademicYears().catch(() => []),
    ]);

    const activeYearId = (years || []).find((y) => y.isActive)?._id || '';
    const branchId =
        (branches || []).some((b) => String(b._id) === String(cookieBranchId))
            ? cookieBranchId
            : (branches?.[0]?._id || '');
    const academicYearId =
        (years || []).some((y) => String(y._id) === String(cookieYearId))
            ? cookieYearId
            : activeYearId || (years?.[0]?._id || '');

    if (!academicYearId || !branchId) {
        return (
            <Box>
                <Typography variant="h4" fontWeight="bold">Classes</Typography>
                <Typography color="text.secondary" sx={{ mt: 1 }}>
                    Please create at least one Branch and one Academic Year first.
                </Typography>
            </Box>
        );
    }

    const classEntries = await getFeeStructures(academicYearId, branchId).catch(() => []);
    const branchName = (branches || []).find((b) => String(b._id) === String(branchId))?.name || '';
    const yearName = (years || []).find((y) => String(y._id) === String(academicYearId))?.name || '';

    return (
        <ElectronClassesClient
            academicYearId={academicYearId}
            branchId={branchId}
            branchName={branchName}
            yearName={yearName}
            classEntries={classEntries}
        />
    );
}

