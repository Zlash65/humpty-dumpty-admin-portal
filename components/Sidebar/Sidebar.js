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
    Assessment as ReportsIcon,
    ExpandLess,
    ExpandMore
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
                <ListItem disablePadding>
                    <ListItemButton
                        selected={isActive}
                        sx={{
                            borderRadius: 1,
                            mx: 1,
                            '&.Mui-selected': {
                                bgcolor: 'primary.light',
                                color: 'primary.main',
                                '& .MuiListItemIcon-root': {
                                    color: 'primary.main'
                                }
                            }
                        }}
                    >
                        <ListItemIcon sx={{ minWidth: 40 }}>
                            {item.icon}
                        </ListItemIcon>
                        <ListItemText
                            primary={item.text}
                            primaryTypographyProps={{
                                fontSize: '0.9rem',
                                fontWeight: isActive ? 600 : 400
                            }}
                        />
                    </ListItemButton>
                </ListItem>
            </Link>
        );
    };

    const renderMenuSection = (title, items) => (
        <>
            <Typography
                variant="overline"
                sx={{
                    px: 3,
                    pt: 2,
                    pb: 0.5,
                    display: 'block',
                    color: 'text.secondary',
                    fontSize: '0.7rem',
                    fontWeight: 600
                }}
            >
                {title}
            </Typography>
            <List dense disablePadding>
                {items.map(renderMenuItem)}
            </List>
        </>
    );

    return (
        <Box sx={{ display: 'flex' }}>
            <AppBar
                position="fixed"
                sx={{
                    zIndex: (theme) => theme.zIndex.drawer + 1,
                    bgcolor: 'primary.main'
                }}
            >
                <Toolbar>
                    <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1, fontWeight: 600 }}>
                        Humpty Dumpty Admin
                    </Typography>
                    <LogoutButton />
                </Toolbar>
            </AppBar>
            <Drawer
                variant="permanent"
                sx={{
                    width: drawerWidth,
                    flexShrink: 0,
                    [`& .MuiDrawer-paper`]: {
                        width: drawerWidth,
                        boxSizing: 'border-box',
                        borderRight: '1px solid',
                        borderColor: 'divider'
                    },
                }}
            >
                <Toolbar />
                <Box sx={{ overflow: 'auto', py: 1 }}>
                    {/* Main Menu */}
                    {renderMenuSection('Main', mainMenuItems)}

                    <Divider sx={{ my: 1 }} />

                    {/* People Management */}
                    {renderMenuSection('People', peopleMenuItems)}

                    <Divider sx={{ my: 1 }} />

                    {/* Academic */}
                    {renderMenuSection('Academic', academicMenuItems)}

                    <Divider sx={{ my: 1 }} />

                    {/* Fee Management - Collapsible */}
                    <Typography
                        variant="overline"
                        sx={{
                            px: 3,
                            pt: 2,
                            pb: 0.5,
                            display: 'block',
                            color: 'text.secondary',
                            fontSize: '0.7rem',
                            fontWeight: 600
                        }}
                    >
                        Finance
                    </Typography>
                    <List dense disablePadding>
                        <ListItem disablePadding>
                            <ListItemButton
                                onClick={() => setFeeMenuOpen(!feeMenuOpen)}
                                sx={{ borderRadius: 1, mx: 1 }}
                            >
                                <ListItemIcon sx={{ minWidth: 40 }}>
                                    <FeesIcon />
                                </ListItemIcon>
                                <ListItemText
                                    primary="Fee Management"
                                    primaryTypographyProps={{ fontSize: '0.9rem' }}
                                />
                                {feeMenuOpen ? <ExpandLess /> : <ExpandMore />}
                            </ListItemButton>
                        </ListItem>
                        <Collapse in={feeMenuOpen} timeout="auto" unmountOnExit>
                            <List dense disablePadding sx={{ pl: 2 }}>
                                {feeMenuItems.map(renderMenuItem)}
                            </List>
                        </Collapse>
                    </List>
                </Box>
            </Drawer>
            <Box component="main" sx={{ flexGrow: 1, p: 3, bgcolor: '#f8f9fa', minHeight: '100vh' }}>
                <Toolbar />
                {children}
            </Box>
        </Box>
    );
}
