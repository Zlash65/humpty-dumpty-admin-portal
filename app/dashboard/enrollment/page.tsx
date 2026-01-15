import { cookies } from 'next/headers';
import { getAcademicYears } from '@/app/actions/academicYear';
import { getBranches } from '@/app/actions/branch';
import { getEnrollmentsPage } from '@/app/actions/enrollment';
import EnrollmentClient from './EnrollmentClient';
import { Box, Typography } from '@mui/material';

interface PageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function EnrollmentPage({ searchParams }: PageProps) {
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
                <Typography variant="h4" fontWeight="bold">Enrollment</Typography>
                <Typography color="text.secondary" sx={{ mt: 1 }}>
                    Please create at least one Branch and one Academic Year first.
                </Typography>
            </Box>
        );
    }

    const enrollmentsPage = await getEnrollmentsPage({ academicYearId, branchId, page: 0, pageSize: 10 }).catch(() => ({ rows: [], total: 0 }));
    const yearName = (years || []).find((y) => String(y._id) === String(academicYearId))?.name || '';

    return (
        <EnrollmentClient
            key={`${branchId}-${academicYearId}`}
            years={years}
            academicYearId={academicYearId}
            branchId={branchId}
            yearName={yearName}
            initialEnrollments={enrollmentsPage.rows}
            initialEnrollmentRowCount={enrollmentsPage.total}
        />
    );
}
