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
    Collapse
} from '@mui/material';
import {
    Dashboard as DashboardIcon,
    School as SchoolIcon,
    People as PeopleIcon,
    Class as ClassIcon,
    AttachMoney as FeesIcon,
    Receipt as ReceiptIcon,
    Business as BranchIcon,
    Group as StaffIcon,
    DirectionsBus as TransportIcon,
    ExpandMore,
    AccountBalanceWallet as WalletIcon
} from '@mui/icons-material';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import LogoutButton from '@/app/dashboard/LogoutButton';

const drawerWidth = 260;

export default function Sidebar({ children }) {
    const pathname = usePathname();
    const [feeMenuOpen, setFeeMenuOpen] = React.useState(
        pathname?.startsWith('/dashboard/fees')
    );

    const mainMenuItems = [
        { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
        { text: 'Branches', icon: <BranchIcon />, path: '/dashboard/branches' },
        { text: 'Academic Years', icon: <SchoolIcon />, path: '/dashboard/academic-years' },
    ];

    const peopleMenuItems = [
        { text: 'Students', icon: <PeopleIcon />, path: '/dashboard/students' },
        { text: 'Staff', icon: <StaffIcon />, path: '/dashboard/staff' },
        { text: 'Transport', icon: <TransportIcon />, path: '/dashboard/transport' },
    ];

    const academicMenuItems = [
        { text: 'Enrollment', icon: <ClassIcon />, path: '/dashboard/enrollment' },
    ];

    const feeMenuItems = [
        { text: 'Fee Records', icon: <ReceiptIcon />, path: '/dashboard/fees' },
        { text: 'Fee Structures', icon: <FeesIcon />, path: '/dashboard/fees/structures' },
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
                                Humpty Dumpty
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
                    {/* Main Menu */}
                    {renderMenuSection('Main', mainMenuItems)}

                    <Divider sx={{ my: 1, mx: 2, borderColor: '#f1f5f9' }} />

                    {/* People Management */}
                    {renderMenuSection('People', peopleMenuItems)}

                    <Divider sx={{ my: 1, mx: 2, borderColor: '#f1f5f9' }} />

                    {/* Academic */}
                    {renderMenuSection('Academic', academicMenuItems)}

                    <Divider sx={{ my: 1, mx: 2, borderColor: '#f1f5f9' }} />

                    {/* Fee Management - Collapsible */}
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
                            Finance
                        </Typography>
                        <List dense disablePadding>
                            <ListItem disablePadding sx={{ mb: 0.5 }}>
                                <ListItemButton
                                    onClick={() => setFeeMenuOpen(!feeMenuOpen)}
                                    sx={{
                                        borderRadius: 2,
                                        mx: 1,
                                        py: 1,
                                        bgcolor: pathname?.startsWith('/dashboard/fees') ? '#f0f4ff' : 'transparent',
                                        '&:hover': {
                                            bgcolor: '#f1f5f9',
                                        },
                                    }}
                                >
                                    <ListItemIcon sx={{ minWidth: 40, color: pathname?.startsWith('/dashboard/fees') ? '#4f46e5' : '#64748b' }}>
                                        <WalletIcon />
                                    </ListItemIcon>
                                    <ListItemText
                                        primary="Fee Management"
                                        primaryTypographyProps={{
                                            fontSize: '0.875rem',
                                            fontWeight: 500,
                                            fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
                                        }}
                                    />
                                    <ExpandMore
                                        sx={{
                                            fontSize: 20,
                                            color: '#94a3b8',
                                            transition: 'transform 0.2s',
                                            transform: feeMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                        }}
                                    />
                                </ListItemButton>
                            </ListItem>
                            <Collapse in={feeMenuOpen} timeout="auto" unmountOnExit>
                                <List dense disablePadding sx={{ pl: 2 }}>
                                    {feeMenuItems.map(renderMenuItem)}
                                </List>
                            </Collapse>
                        </List>
                    </Box>
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
