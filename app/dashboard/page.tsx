import { Grid, Paper, Typography, Box, Chip, Divider } from '@mui/material';
import Link from 'next/link';
import {
    School as SchoolIcon,
    People as PeopleIcon,
    Class as ClassIcon,
    Receipt as ReceiptIcon,
    Business as BranchIcon,
    Group as StaffIcon,
    DirectionsBus as TransportIcon,
    TrendingUp,
    TrendingDown,
    AttachMoney,
    AccountBalance,
    CalendarToday as CalendarIcon
} from '@mui/icons-material';
import { getStudentCount } from '@/app/actions/student';
import { getStaffCount } from '@/app/actions/staff';
import { getTransportCount } from '@/app/actions/transport';
import { getBranchCount } from '@/app/actions/branch';
import { getFeeStats, getRecentTransactions } from '@/app/actions/feeRecord';
import { getAcademicYears } from '@/app/actions/academicYear';
import { getMonthlyCollectionData, getEnrollmentByClass, getDashboardAlerts } from '@/app/actions/dashboard';
import FeeCollectionChart from '@/components/charts/FeeCollectionChart';
import EnrollmentChart from '@/components/charts/EnrollmentChart';
import AlertsPanel from '@/components/AlertsPanel';

interface FeeStats {
    totalDue: number;
    totalCollected: number;
    totalPending: number;
    todayCollection: number;
    monthCollection: number;
}

interface RecentTransaction {
    _id?: string;
    studentName?: string;
    receiptNumber?: string;
    paymentMode?: string;
    amount?: number;
    date?: string;
}

interface MonthlyCollectionData {
    month: string;
    amount: number;
}

interface EnrollmentData {
    className: string;
    count: number;
    [key: string]: string | number;
}

interface Alert {
    type: 'warning' | 'error' | 'info';
    title: string;
    message: string;
    link?: string;
}

interface DashboardStats {
    students: number;
    staff: number;
    transport: number;
    branches: number;
    feeStats: FeeStats;
    recentTransactions: RecentTransaction[];
    monthlyCollectionData: MonthlyCollectionData[];
    enrollmentByClass: EnrollmentData[];
    alerts: Alert[];
    activeYear: string;
}

async function getStats(): Promise<DashboardStats> {
    try {
        const [
            students,
            staff,
            transport,
            branches,
            academicYears,
            monthlyCollectionData,
            enrollmentByClass,
            alerts
        ] = await Promise.all([
            getStudentCount().catch(() => 0),
            getStaffCount().catch(() => 0),
            getTransportCount().catch(() => 0),
            getBranchCount().catch(() => 0),
            getAcademicYears().catch(() => []),
            getMonthlyCollectionData().catch(() => []),
            getEnrollmentByClass().catch(() => []),
            getDashboardAlerts().catch(() => [])
        ]);

        const activeYear = academicYears.find(y => y.isActive);
        let feeStats: FeeStats = { totalDue: 0, totalCollected: 0, totalPending: 0, todayCollection: 0, monthCollection: 0 };
        let recentTransactions: RecentTransaction[] = [];

        if (activeYear) {
            feeStats = await getFeeStats(activeYear._id).catch(() => feeStats);
            recentTransactions = await getRecentTransactions(5).catch(() => []);
        }

        return {
            students,
            staff,
            transport,
            branches,
            feeStats,
            recentTransactions,
            monthlyCollectionData,
            enrollmentByClass: enrollmentByClass as EnrollmentData[],
            alerts,
            activeYear: activeYear?.name || 'No active year'
        };
    } catch {
        return {
            students: 0,
            staff: 0,
            transport: 0,
            branches: 0,
            feeStats: { totalDue: 0, totalCollected: 0, totalPending: 0, todayCollection: 0, monthCollection: 0 },
            recentTransactions: [],
            monthlyCollectionData: [],
            enrollmentByClass: [],
            alerts: [],
            activeYear: 'Error loading'
        };
    }
}

function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(amount);
}

function formatDate(dateStr: string | undefined): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

type ColorKey = 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate';

const iconColors: Record<ColorKey, { bg: string; icon: string }> = {
    indigo: { bg: '#f0f4ff', icon: '#4f46e5' },
    emerald: { bg: '#ecfdf5', icon: '#059669' },
    amber: { bg: '#fffbeb', icon: '#d97706' },
    rose: { bg: '#fff1f2', icon: '#e11d48' },
    slate: { bg: '#f1f5f9', icon: '#475569' },
};

interface StatCardProps {
    title: string;
    value: number;
    icon: React.ReactNode;
    color?: ColorKey;
}

function StatCard({ title, value, icon, color = 'indigo' }: StatCardProps) {
    const colors = iconColors[color];
    return (
        <Paper
            sx={{
                p: 3,
                height: '100%',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
        >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                    <Typography
                        variant="body2"
                        sx={{ color: '#64748b', fontWeight: 500, mb: 0.5 }}
                    >
                        {title}
                    </Typography>
                    <Typography
                        variant="h4"
                        sx={{
                            fontWeight: 700,
                            fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
                            color: '#1e293b',
                        }}
                    >
                        {value}
                    </Typography>
                </Box>
                <Box
                    sx={{
                        width: 48,
                        height: 48,
                        borderRadius: 2,
                        bgcolor: colors.bg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    {icon}
                </Box>
            </Box>
        </Paper>
    );
}

interface FeeCardProps {
    title: string;
    amount: number;
    icon: React.ReactNode;
    color?: ColorKey;
}

function FeeCard({ title, amount, icon, color = 'indigo' }: FeeCardProps) {
    const colors = iconColors[color];
    return (
        <Paper
            sx={{
                p: 2.5,
                height: '100%',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box
                    sx={{
                        width: 44,
                        height: 44,
                        borderRadius: 2,
                        bgcolor: colors.bg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    {icon}
                </Box>
                <Box>
                    <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 500 }}>
                        {title}
                    </Typography>
                    <Typography
                        variant="h6"
                        sx={{
                            fontWeight: 700,
                            fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
                            color: colors.icon,
                        }}
                    >
                        {formatCurrency(amount)}
                    </Typography>
                </Box>
            </Box>
        </Paper>
    );
}

interface QuickLinkCardProps {
    title: string;
    path: string;
    icon: React.ReactNode;
}

function QuickLinkCard({ title, path, icon }: QuickLinkCardProps) {
    return (
        <Link href={path} style={{ textDecoration: 'none' }}>
            <Paper
                sx={{
                    p: 2.5,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    cursor: 'pointer',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                        borderColor: '#4f46e5',
                        bgcolor: '#f8fafc',
                    }
                }}
            >
                <Box sx={{ mb: 1.5 }}>{icon}</Box>
                <Typography
                    variant="body2"
                    sx={{
                        fontWeight: 600,
                        fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
                        color: '#334155',
                    }}
                >
                    {title}
                </Typography>
            </Paper>
        </Link>
    );
}

export default async function DashboardPage() {
    const stats = await getStats();

    const quickLinks: QuickLinkCardProps[] = [
        { title: 'Academic Years', path: '/dashboard/academic-years', icon: <SchoolIcon sx={{ fontSize: 32, color: '#4f46e5' }} /> },
        { title: 'Students', path: '/dashboard/students', icon: <PeopleIcon sx={{ fontSize: 32, color: '#059669' }} /> },
        { title: 'Enrollment', path: '/dashboard/enrollment', icon: <ClassIcon sx={{ fontSize: 32, color: '#d97706' }} /> },
        { title: 'Fee Collection', path: '/dashboard/fees', icon: <ReceiptIcon sx={{ fontSize: 32, color: '#e11d48' }} /> },
        { title: 'Branches', path: '/dashboard/branches', icon: <BranchIcon sx={{ fontSize: 32, color: '#7c3aed' }} /> },
        { title: 'Staff', path: '/dashboard/staff', icon: <StaffIcon sx={{ fontSize: 32, color: '#0891b2' }} /> },
        { title: 'Transport', path: '/dashboard/transport', icon: <TransportIcon sx={{ fontSize: 32, color: '#475569' }} /> },
    ];

    return (
        <Box sx={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
            {/* Header */}
            <Box sx={{
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                justifyContent: 'space-between',
                alignItems: { xs: 'flex-start', sm: 'flex-start' },
                gap: 2,
                mb: 4,
                minWidth: 0,
                width: '100%',
            }}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography
                        variant="h4"
                        sx={{
                            fontWeight: 700,
                            fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
                            color: '#1e293b',
                            mb: 0.5,
                        }}
                    >
                        Dashboard
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#64748b' }}>
                        Welcome back! Here&apos;s an overview of your school.
                    </Typography>
                </Box>
                <Chip
                    icon={<CalendarIcon sx={{ fontSize: 18 }} />}
                    label={stats.activeYear}
                    sx={{
                        bgcolor: '#f0f4ff',
                        color: '#4f46e5',
                        fontWeight: 600,
                        border: '1px solid #c7d2fe',
                        '& .MuiChip-icon': { color: '#4f46e5' },
                        maxWidth: { xs: '100%', sm: '300px' },
                        width: { xs: '100%', sm: 'auto' },
                        '& .MuiChip-label': {
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }
                    }}
                />
            </Box>

            {/* Stats Overview */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid size={{ xs: 6, sm: 3 }}>
                    <StatCard
                        title="Total Students"
                        value={stats.students}
                        icon={<PeopleIcon sx={{ fontSize: 24, color: iconColors.indigo.icon }} />}
                        color="indigo"
                    />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                    <StatCard
                        title="Total Staff"
                        value={stats.staff}
                        icon={<StaffIcon sx={{ fontSize: 24, color: iconColors.emerald.icon }} />}
                        color="emerald"
                    />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                    <StatCard
                        title="Vehicles"
                        value={stats.transport}
                        icon={<TransportIcon sx={{ fontSize: 24, color: iconColors.amber.icon }} />}
                        color="amber"
                    />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                    <StatCard
                        title="Branches"
                        value={stats.branches}
                        icon={<BranchIcon sx={{ fontSize: 24, color: iconColors.slate.icon }} />}
                        color="slate"
                    />
                </Grid>
            </Grid>

            {/* Fee Collection Stats */}
            <Box sx={{ mb: 4 }}>
                <Typography
                    variant="h6"
                    sx={{
                        fontWeight: 600,
                        fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
                        color: '#1e293b',
                        mb: 2,
                    }}
                >
                    Fee Collection Overview
                </Typography>
                <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                        <FeeCard
                            title="Today's Collection"
                            amount={stats.feeStats.todayCollection}
                            icon={<AttachMoney sx={{ fontSize: 22, color: iconColors.emerald.icon }} />}
                            color="emerald"
                        />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                        <FeeCard
                            title="This Month"
                            amount={stats.feeStats.monthCollection}
                            icon={<TrendingUp sx={{ fontSize: 22, color: iconColors.indigo.icon }} />}
                            color="indigo"
                        />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                        <FeeCard
                            title="Total Collected"
                            amount={stats.feeStats.totalCollected}
                            icon={<AccountBalance sx={{ fontSize: 22, color: iconColors.slate.icon }} />}
                            color="slate"
                        />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                        <FeeCard
                            title="Pending Fees"
                            amount={stats.feeStats.totalPending}
                            icon={<TrendingDown sx={{ fontSize: 22, color: iconColors.amber.icon }} />}
                            color="amber"
                        />
                    </Grid>
                </Grid>
            </Box>

            {/* Charts Section */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid size={{ xs: 12, md: 7 }}>
                    <FeeCollectionChart data={stats.monthlyCollectionData} />
                </Grid>
                <Grid size={{ xs: 12, md: 5 }}>
                    <EnrollmentChart data={stats.enrollmentByClass} />
                </Grid>
            </Grid>

            {/* Alerts Panel */}
            {stats.alerts.length > 0 && (
                <Box sx={{ mb: 4 }}>
                    <AlertsPanel alerts={stats.alerts} />
                </Box>
            )}

            {/* Recent Transactions & Quick Links */}
            <Grid container spacing={3}>
                {/* Recent Transactions */}
                <Grid size={{ xs: 12, md: 5 }}>
                    <Paper sx={{ p: 3, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <Typography
                            variant="h6"
                            sx={{
                                fontWeight: 600,
                                fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
                                color: '#1e293b',
                                mb: 2,
                            }}
                        >
                            Recent Transactions
                        </Typography>
                        <Divider sx={{ mb: 2 }} />
                        {stats.recentTransactions.length > 0 ? (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                                {stats.recentTransactions.map((tx, index) => (
                                    <Box
                                        key={tx._id || index}
                                        sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            p: 2,
                                            borderRadius: 2,
                                            bgcolor: '#f8fafc',
                                            border: '1px solid #f1f5f9',
                                        }}
                                    >
                                        <Box>
                                            <Typography variant="body2" sx={{ fontWeight: 600, color: '#1e293b' }}>
                                                {tx.studentName || 'Unknown Student'}
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: '#64748b' }}>
                                                {tx.receiptNumber} - {tx.paymentMode}
                                            </Typography>
                                        </Box>
                                        <Box sx={{ textAlign: 'right' }}>
                                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#059669' }}>
                                                {formatCurrency(tx.amount)}
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: '#64748b' }}>
                                                {formatDate(tx.date)}
                                            </Typography>
                                        </Box>
                                    </Box>
                                ))}
                            </Box>
                        ) : (
                            <Box sx={{ py: 6, textAlign: 'center', bgcolor: '#f8fafc', borderRadius: 2 }}>
                                <ReceiptIcon sx={{ fontSize: 40, color: '#cbd5e1', mb: 1 }} />
                                <Typography variant="body2" sx={{ color: '#64748b' }}>
                                    No recent transactions
                                </Typography>
                            </Box>
                        )}
                    </Paper>
                </Grid>

                {/* Quick Links */}
                <Grid size={{ xs: 12, md: 7 }}>
                    <Paper sx={{ p: 3, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <Typography
                            variant="h6"
                            sx={{
                                fontWeight: 600,
                                fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
                                color: '#1e293b',
                                mb: 2,
                            }}
                        >
                            Quick Access
                        </Typography>
                        <Divider sx={{ mb: 2 }} />
                        <Grid container spacing={2}>
                            {quickLinks.map((card) => (
                                <Grid size={{ xs: 6, sm: 4, lg: 3 }} key={card.title}>
                                    <QuickLinkCard title={card.title} path={card.path} icon={card.icon} />
                                </Grid>
                            ))}
                        </Grid>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
}
