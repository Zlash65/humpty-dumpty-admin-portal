import Sidebar from '@/components/Sidebar/Sidebar';
import { getSettings } from '@/app/actions/settings';
import { getBranches } from '@/app/actions/branch';
import { getAcademicYears } from '@/app/actions/academicYear';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

interface DashboardLayoutProps {
    children: React.ReactNode;
}

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
    const [settings, branches, years] = await Promise.all([
        getSettings(),
        getBranches().catch(() => []),
        getAcademicYears().catch(() => []),
    ]);

    const cookieStore = await cookies();
    const cookieBranchId = cookieStore.get('branch_id')?.value || '';
    const cookieYearId = cookieStore.get('academic_year_id')?.value || '';

    const activeYearId = (years || []).find((y) => y.isActive)?._id || '';

    const selectedBranchId =
        (branches || []).some((b) => String(b._id) === String(cookieBranchId))
            ? cookieBranchId
            : (branches?.[0]?._id || '');
    const selectedAcademicYearId =
        (years || []).some((y) => String(y._id) === String(cookieYearId))
            ? cookieYearId
            : activeYearId || (years?.[0]?._id || '');

    return (
        <Sidebar
            settings={settings}
            branches={branches}
            years={years}
            selectedBranchId={selectedBranchId}
            selectedAcademicYearId={selectedAcademicYearId}
        >
            {children}
        </Sidebar>
    );
}
