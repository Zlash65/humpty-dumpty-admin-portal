import { cookies } from 'next/headers';
import { getBranches } from '@/app/actions/branch';
import { getAcademicYears } from '@/app/actions/academicYear';
import { getFeeStructuresPage } from '@/app/actions/feeStructure';
import ElectronClassesClient from './ElectronClassesClient';
import { Box, Typography } from '@mui/material';

interface PageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ClassesPage({ searchParams }: PageProps) {
    const _params = await searchParams;
    void _params; // Consume to satisfy Next.js 15 async searchParams requirement
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

    const classEntriesPage = await getFeeStructuresPage(academicYearId, branchId, '', 0, 5).catch(() => ({ rows: [], total: 0 }));
    const branchName = (branches || []).find((b) => String(b._id) === String(branchId))?.name || '';
    const yearName = (years || []).find((y) => String(y._id) === String(academicYearId))?.name || '';

    return (
        <ElectronClassesClient
            key={`${branchId}-${academicYearId}`}
            academicYearId={academicYearId}
            branchId={branchId}
            branchName={branchName}
            yearName={yearName}
            initialClassEntries={classEntriesPage.rows}
            initialClassEntryRowCount={classEntriesPage.total}
        />
    );
}
