import { Grid, Paper, Typography, Box, Chip, Divider, Card, CardContent } from '@mui/material';
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
    AccountBalance
} from '@mui/icons-material';
import { getStudentCount } from '@/app/actions/student';
import { getStaffCount } from '@/app/actions/staff';
import { getTransportCount } from '@/app/actions/transport';
import { getBranchCount } from '@/app/actions/branch';
import { getFeeStats, getRecentTransactions } from '@/app/actions/feeRecord';
import { getAcademicYears } from '@/app/actions/academicYear';

async function getStats() {
    try {
        const [students, staff, transport, branches, academicYears] = await Promise.all([
            getStudentCount().catch(() => 0),
            getStaffCount().catch(() => 0),
            getTransportCount().catch(() => 0),
            getBranchCount().catch(() => 0),
            getAcademicYears().catch(() => [])
        ]);

        // Get active academic year for fee stats
        const activeYear = academicYears.find(y => y.isActive);
        let feeStats = { totalDue: 0, totalCollected: 0, totalPending: 0, todayCollection: 0, monthCollection: 0 };
        let recentTransactions = [];

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
            activeYear: activeYear?.name || 'No active year'
        };
    } catch (error) {
        console.error('Error fetching stats:', error);
        return {
            students: 0,
            staff: 0,
            transport: 0,
            branches: 0,
            feeStats: { totalDue: 0, totalCollected: 0, totalPending: 0, todayCollection: 0, monthCollection: 0 },
            recentTransactions: [],
            activeYear: 'Error loading'
        };
    }
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(amount);
}

// Format date consistently to avoid hydration mismatch
function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function StatCard({ title, value, icon, color = 'primary', subtitle }) {
    return (
        <Paper sx={{ p: 2.5, height: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                        {title}
                    </Typography>
                    <Typography variant="h4" fontWeight="bold" color={`${color}.main`}>
                        {value}
                    </Typography>
                    {subtitle && (
                        <Typography variant="caption" color="text.secondary">
                            {subtitle}
                        </Typography>
                    )}
                </Box>
                <Box sx={{ bgcolor: `${color}.light`, p: 1, borderRadius: 2, opacity: 0.8 }}>
                    {icon}
                </Box>
            </Box>
        </Paper>
    );
}

function FeeCard({ title, amount, icon, color = 'primary' }) {
    return (
        <Paper sx={{ p: 2, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ bgcolor: `${color}.light`, p: 1, borderRadius: 1.5 }}>
                    {icon}
                </Box>
                <Box>
                    <Typography variant="caption" color="text.secondary">
                        {title}
                    </Typography>
                    <Typography variant="h6" fontWeight="bold" color={`${color}.main`}>
                        {formatCurrency(amount)}
                    </Typography>
                </Box>
            </Box>
        </Paper>
    );
}

export default async function DashboardPage() {
    const stats = await getStats();

    const quickLinks = [
        { title: 'Academic Years', desc: 'Manage school years', path: '/dashboard/academic-years', icon: <SchoolIcon fontSize="large" color="primary" /> },
        { title: 'Students', desc: 'Admission and Directory', path: '/dashboard/students', icon: <PeopleIcon fontSize="large" color="secondary" /> },
        { title: 'Enrollment', desc: 'Assign classes', path: '/dashboard/enrollment', icon: <ClassIcon fontSize="large" color="success" /> },
        { title: 'Fee Collection', desc: 'View records and pay', path: '/dashboard/fees', icon: <ReceiptIcon fontSize="large" color="warning" /> },
        { title: 'Branches', desc: 'Manage branches', path: '/dashboard/branches', icon: <BranchIcon fontSize="large" color="info" /> },
        { title: 'Staff', desc: 'Staff management', path: '/dashboard/staff', icon: <StaffIcon fontSize="large" color="error" /> },
        { title: 'Transport', desc: 'Vehicle management', path: '/dashboard/transport', icon: <TransportIcon fontSize="large" color="primary" /> },
    ];

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box>
                    <Typography variant="h4" fontWeight="bold">
                        Dashboard
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Welcome to School Admin Portal
                    </Typography>
                </Box>
                <Chip
                    icon={<SchoolIcon />}
                    label={`Academic Year: ${stats.activeYear}`}
                    color="primary"
                    variant="outlined"
                />
            </Box>

            {/* Stats Overview */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid size={{ xs: 6, sm: 3 }}>
                    <StatCard
                        title="Total Students"
                        value={stats.students}
                        icon={<PeopleIcon color="primary" />}
                        color="primary"
                    />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                    <StatCard
                        title="Total Staff"
                        value={stats.staff}
                        icon={<StaffIcon color="secondary" />}
                        color="secondary"
                    />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                    <StatCard
                        title="Vehicles"
                        value={stats.transport}
                        icon={<TransportIcon color="success" />}
                        color="success"
                    />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                    <StatCard
                        title="Branches"
                        value={stats.branches}
                        icon={<BranchIcon color="info" />}
                        color="info"
                    />
                </Grid>
            </Grid>

            {/* Fee Collection Stats */}
            <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ mt: 4 }}>
                Fee Collection Overview
            </Typography>
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <FeeCard
                        title="Today's Collection"
                        amount={stats.feeStats.todayCollection}
                        icon={<AttachMoney color="success" />}
                        color="success"
                    />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <FeeCard
                        title="This Month"
                        amount={stats.feeStats.monthCollection}
                        icon={<TrendingUp color="primary" />}
                        color="primary"
                    />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <FeeCard
                        title="Total Collected"
                        amount={stats.feeStats.totalCollected}
                        icon={<AccountBalance color="info" />}
                        color="info"
                    />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <FeeCard
                        title="Pending Fees"
                        amount={stats.feeStats.totalPending}
                        icon={<TrendingDown color="warning" />}
                        color="warning"
                    />
                </Grid>
            </Grid>

            {/* Recent Transactions & Quick Links */}
            <Grid container spacing={3}>
                {/* Recent Transactions */}
                <Grid size={{ xs: 12, md: 5 }}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6" fontWeight="bold" gutterBottom>
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
                                            p: 1.5,
                                            bgcolor: 'grey.50',
                                            borderRadius: 1
                                        }}
                                    >
                                        <Box>
                                            <Typography variant="body2" fontWeight="medium">
                                                {tx.studentName || 'Unknown Student'}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {tx.receiptNumber} • {tx.paymentMode}
                                            </Typography>
                                        </Box>
                                        <Box sx={{ textAlign: 'right' }}>
                                            <Typography variant="body2" fontWeight="bold" color="success.main">
                                                {formatCurrency(tx.amount)}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {formatDate(tx.date)}
                                            </Typography>
                                        </Box>
                                    </Box>
                                ))}
                            </Box>
                        ) : (
                            <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                                No recent transactions
                            </Typography>
                        )}
                    </Paper>
                </Grid>

                {/* Quick Links */}
                <Grid size={{ xs: 12, md: 7 }}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6" fontWeight="bold" gutterBottom>
                            Quick Access
                        </Typography>
                        <Divider sx={{ mb: 2 }} />
                        <Grid container spacing={2}>
                            {quickLinks.map((card) => (
                                <Grid size={{ xs: 6, sm: 4 }} key={card.title}>
                                    <Link href={card.path} style={{ textDecoration: 'none' }}>
                                        <Paper
                                            variant="outlined"
                                            sx={{
                                                p: 2,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                textAlign: 'center',
                                                cursor: 'pointer',
                                                transition: '0.2s',
                                                '&:hover': {
                                                    bgcolor: 'grey.50',
                                                    borderColor: 'primary.main'
                                                }
                                            }}
                                        >
                                            <Box mb={1}>{card.icon}</Box>
                                            <Typography variant="body2" fontWeight="medium">{card.title}</Typography>
                                        </Paper>
                                    </Link>
                                </Grid>
                            ))}
                        </Grid>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
}
