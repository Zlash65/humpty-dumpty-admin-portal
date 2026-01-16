import { getAcademicYears } from '@/app/actions/academicYear';
import { getBranches } from '@/app/actions/branch';
import { getFeeStructures } from '@/app/actions/feeStructure';
import { getStudentDirectoryPage } from '@/app/actions/student';
import { cookies } from 'next/headers';
import StudentsClient from './StudentsClient';
import {
    Box,
    Typography,
} from '@mui/material';

interface PageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function StudentsPage({ searchParams }: PageProps) {
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
                <Typography variant="h4" fontWeight="bold">Students</Typography>
                <Typography color="text.secondary" sx={{ mt: 1 }}>
                    Please create at least one Branch and one Academic Year first.
                </Typography>
            </Box>
        );
    }

    const [classEntries, directory] = await Promise.all([
        getFeeStructures(academicYearId, branchId).catch(() => []),
        getStudentDirectoryPage({ academicYearId, branchId, page: 0, pageSize: 10 }).catch(() => ({ rows: [], total: 0 })),
    ]);

    const branchName = (branches || []).find((b) => String(b._id) === String(branchId))?.name || '';
    const yearName = (years || []).find((y) => String(y._id) === String(academicYearId))?.name || '';

    return (
        <StudentsClient
            key={`${branchId}-${academicYearId}`}
            initialStudents={directory.rows}
            initialStudentRowCount={directory.total}
            academicYearId={academicYearId}
            branchId={branchId}
            classEntries={classEntries}
            branchName={branchName}
            yearName={yearName}
        />
    );
}
