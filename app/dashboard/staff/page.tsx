import { getStaffPage } from '@/app/actions/staff';
import { getBranches } from '@/app/actions/branch';
import { getAcademicYears } from '@/app/actions/academicYear';
import { getFeeStructures } from '@/app/actions/feeStructure';
import { cookies } from 'next/headers';
import StaffClient from './StaffClient';
import { Box, Typography } from '@mui/material';

interface PageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function StaffPage({ searchParams }: PageProps) {
    const _params = await searchParams;
    void _params; // Consume to satisfy Next.js 15 async searchParams requirement
    const cookieStore = await cookies();
    const cookieBranchId = cookieStore.get('branch_id')?.value || '';
    const cookieYearId = cookieStore.get('academic_year_id')?.value || '';

    const [branches, years, staffPage] = await Promise.all([
        getBranches().catch(() => []),
        getAcademicYears().catch(() => []),
        // Electron parity: staff list isn't branch-scoped; keep global directory.
        getStaffPage({ page: 0, pageSize: 10 }).catch(() => ({ rows: [], total: 0 })),
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
                <Typography variant="h4" fontWeight="bold">Staff</Typography>
                <Typography color="text.secondary" sx={{ mt: 1 }}>
                    Please create at least one Branch and one Academic Year first.
                </Typography>
            </Box>
        );
    }

    const [classEntries] = await Promise.all([
        // Electron parity: staff assignments can target classes from any branch,
        // so load class entries across all branches for the selected year.
        getFeeStructures(academicYearId).catch(() => []),
    ]);

    const branchName = (branches || []).find((b) => String(b._id) === String(branchId))?.name || '';
    const yearName = (years || []).find((y) => String(y._id) === String(academicYearId))?.name || '';

    return (
        <StaffClient
            key={`${branchId}-${academicYearId}`}
            initialStaff={staffPage.rows}
            initialStaffRowCount={staffPage.total}
            classEntries={classEntries}
            branches={branches}
            academicYearId={academicYearId}
            branchId={branchId}
            branchName={branchName}
            yearName={yearName}
        />
    );
}
