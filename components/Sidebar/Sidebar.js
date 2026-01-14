'use client';

import * as React from 'react';
import {
    Box,
    Drawer,
    AppBar,
    Toolbar,
    List,
    Typography,
    Divider,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    MenuItem,
    Select,
    FormControl,
    InputLabel,
    IconButton,
    Tooltip,
} from '@mui/material';
import {
    Dashboard as DashboardIcon,
    School as SchoolIcon,
    People as PeopleIcon,
    Class as ClassIcon,
    Receipt as ReceiptIcon,
    Business as BranchIcon,
    Group as StaffIcon,
    DirectionsBus as TransportIcon,
    Settings as SettingsIcon,
    History as AuditIcon,
    Add as AddIcon,
} from '@mui/icons-material';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import LogoutButton from '@/app/dashboard/LogoutButton';

const drawerWidth = 260;

export default function Sidebar({ children, settings, branches = [], years = [], selectedBranchId = '', selectedAcademicYearId = '' }) {
    const schoolName = settings?.schoolName || 'School';
    const pathname = usePathname();
    const router = useRouter();

    const [branchId, setBranchId] = React.useState(selectedBranchId);
    const [academicYearId, setAcademicYearId] = React.useState(selectedAcademicYearId);

    React.useEffect(() => {
        setBranchId(selectedBranchId);
    }, [selectedBranchId]);

    React.useEffect(() => {
        setAcademicYearId(selectedAcademicYearId);
    }, [selectedAcademicYearId]);

    const persistContext = async (next) => {
        await fetch('/api/context', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(next),
        });
        router.refresh();
    };

    // Electron parity: keep the primary navigation order and labels the same as the Electron app.
    const primaryMenuItems = [
        { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
        { text: 'Students', icon: <PeopleIcon />, path: '/dashboard/students' },
        { text: 'Classes', icon: <ClassIcon />, path: '/dashboard/classes' },
        { text: 'Staff', icon: <StaffIcon />, path: '/dashboard/staff' },
        { text: 'Transport', icon: <TransportIcon />, path: '/dashboard/transport' },
        { text: 'Fees', icon: <ReceiptIcon />, path: '/dashboard/fees' },
    ];

    // Extra admin capabilities (web-only). Kept, but separated so the core Electron flow is unchanged.
    const adminMenuItems = [
        { text: 'Enrollment', icon: <ClassIcon />, path: '/dashboard/enrollment' },
        { text: 'Branches', icon: <BranchIcon />, path: '/dashboard/branches' },
        { text: 'Academic Years', icon: <SchoolIcon />, path: '/dashboard/academic-years' },
        { text: 'Settings', icon: <SettingsIcon />, path: '/dashboard/settings' },
        { text: 'Audit Log', icon: <AuditIcon />, path: '/dashboard/audit' },
    ];

    const renderMenuItem = (item) => {
        const isActive = pathname === item.path ||
            (item.path !== '/dashboard' && pathname?.startsWith(item.path));

        return (
            <Link key={item.text} href={item.path} style={{ textDecoration: 'none', color: 'inherit' }}>
                <ListItem disablePadding sx={{ mb: 0.5 }}>
                    <ListItemButton
                        selected={isActive}
                        sx={{
                            borderRadius: 2,
                            mx: 1,
                            py: 1,
                            '&:hover': {
                                bgcolor: '#f1f5f9',
                            },
                            '&.Mui-selected': {
                                bgcolor: '#f0f4ff',
                                color: '#4f46e5',
                                '& .MuiListItemIcon-root': {
                                    color: '#4f46e5',
                                },
                                '&:hover': {
                                    bgcolor: '#e0e7ff',
                                }
                            }
                        }}
                    >
                        <ListItemIcon sx={{ minWidth: 40, color: isActive ? '#4f46e5' : '#64748b' }}>
                            {item.icon}
                        </ListItemIcon>
                        <ListItemText
                            primary={item.text}
                            primaryTypographyProps={{
                                fontSize: '0.875rem',
                                fontWeight: isActive ? 600 : 500,
                                fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
                            }}
                        />
                    </ListItemButton>
                </ListItem>
            </Link>
        );
    };

    const renderMenuSection = (title, items) => (
        <Box sx={{ mb: 1 }}>
            <Typography
                variant="overline"
                sx={{
                    px: 2,
                    pt: 2,
                    pb: 0.5,
                    display: 'block',
                    color: '#94a3b8',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
                }}
            >
                {title}
            </Typography>
            <List dense disablePadding>
                {items.map(renderMenuItem)}
            </List>
        </Box>
    );

    return (
        <Box sx={{ display: 'flex' }}>
            {/* App Bar */}
            <AppBar
                position="fixed"
                elevation={0}
                sx={{
                    zIndex: (theme) => theme.zIndex.drawer + 1,
                    bgcolor: '#1e293b',
                    borderBottom: '1px solid #334155',
                }}
            >
                <Toolbar>
                    {/* Logo */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box
                            sx={{
                                width: 36,
                                height: 36,
                                borderRadius: 2,
                                bgcolor: '#4f46e5',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <SchoolIcon sx={{ fontSize: 22, color: 'white' }} />
                        </Box>
                        <Box>
                            <Typography
                                variant="h6"
                                noWrap
                                sx={{
                                    fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
                                    fontWeight: 700,
                                    fontSize: '1.1rem',
                                    color: 'white',
                                    lineHeight: 1.2,
                                }}
                            >
                                {schoolName}
                            </Typography>
                            <Typography
                                variant="caption"
                                sx={{
                                    color: '#94a3b8',
                                    fontWeight: 500,
                                    fontSize: '0.7rem',
                                }}
                            >
                                School Admin Portal
                            </Typography>
                        </Box>
                    </Box>

                    {/* Context selectors (Electron parity: selected branch/year drives all pages) */}
                    <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 2, ml: 4 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <FormControl size="small" sx={{ minWidth: 220 }}>
                                <InputLabel sx={{ color: '#cbd5e1' }}>Branch</InputLabel>
                                <Select
                                    value={branchId}
                                    label="Branch"
                                    onChange={async (e) => {
                                        const next = e.target.value;
                                        setBranchId(next);
                                        await persistContext({ branchId: next });
                                    }}
                                    sx={{
                                        color: 'white',
                                        '.MuiOutlinedInput-notchedOutline': { borderColor: '#334155' },
                                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#475569' },
                                        '.MuiSvgIcon-root': { color: '#cbd5e1' },
                                    }}
                                >
                                    {(branches || []).map((b) => (
                                        <MenuItem key={b._id} value={b._id}>{b.name}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <Tooltip title="Manage branches">
                                <IconButton
                                    size="small"
                                    onClick={() => router.push('/dashboard/branches')}
                                    sx={{ color: '#cbd5e1' }}
                                >
                                    <SettingsIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Add branch">
                                <IconButton
                                    size="small"
                                    onClick={() => router.push('/dashboard/branches')}
                                    sx={{ color: '#cbd5e1' }}
                                >
                                    <AddIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        </Box>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <FormControl size="small" sx={{ minWidth: 220 }}>
                                <InputLabel sx={{ color: '#cbd5e1' }}>Academic Year</InputLabel>
                                <Select
                                    value={academicYearId}
                                    label="Academic Year"
                                    onChange={async (e) => {
                                        const next = e.target.value;
                                        setAcademicYearId(next);
                                        await persistContext({ academicYearId: next });
                                    }}
                                    sx={{
                                        color: 'white',
                                        '.MuiOutlinedInput-notchedOutline': { borderColor: '#334155' },
                                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#475569' },
                                        '.MuiSvgIcon-root': { color: '#cbd5e1' },
                                    }}
                                >
                                    {(years || []).map((y) => (
                                        <MenuItem key={y._id} value={y._id}>
                                            {y.name}{y.isActive ? ' (Active)' : ''}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <Tooltip title="Manage academic years">
                                <IconButton
                                    size="small"
                                    onClick={() => router.push('/dashboard/academic-years')}
                                    sx={{ color: '#cbd5e1' }}
                                >
                                    <SettingsIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Add academic year">
                                <IconButton
                                    size="small"
                                    onClick={() => router.push('/dashboard/academic-years')}
                                    sx={{ color: '#cbd5e1' }}
                                >
                                    <AddIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        </Box>
                    </Box>

                    <Box sx={{ flexGrow: 1 }} />

                    <LogoutButton />
                </Toolbar>
            </AppBar>

            {/* Sidebar Drawer */}
            <Drawer
                variant="permanent"
                sx={{
                    width: drawerWidth,
                    flexShrink: 0,
                    [`& .MuiDrawer-paper`]: {
                        width: drawerWidth,
                        boxSizing: 'border-box',
                        bgcolor: '#ffffff',
                        borderRight: '1px solid #e2e8f0',
                    },
                }}
            >
                <Toolbar />
                <Box sx={{ overflow: 'auto', py: 1 }}>
                    {renderMenuSection('Main', primaryMenuItems)}
                    <Divider sx={{ my: 1, mx: 2, borderColor: '#f1f5f9' }} />
                    {renderMenuSection('Admin', adminMenuItems)}
                </Box>
            </Drawer>

            {/* Main Content */}
            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    p: 3,
                    bgcolor: '#f8fafc',
                    minHeight: '100vh',
                }}
            >
                <Toolbar />
                {children}
            </Box>
        </Box>
    );
}
