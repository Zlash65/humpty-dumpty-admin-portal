import Sidebar from '@/components/Sidebar/Sidebar';

export const dynamic = 'force-dynamic';

export default function DashboardLayout({ children }) {
    return (
        <Sidebar>{children}</Sidebar>
    );
}
