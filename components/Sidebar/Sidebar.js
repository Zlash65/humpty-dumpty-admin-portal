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
    IconButton
} from '@mui/material';
import {
    Menu as MenuIcon,
    Dashboard as DashboardIcon,
    School as SchoolIcon,
    People as PeopleIcon,
    Class as ClassIcon,
    AttachMoney as FeesIcon,
    Receipt as ReceiptIcon,
    Logout as LogoutIcon
} from '@mui/icons-material';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import LogoutButton from '@/app/dashboard/LogoutButton';

const drawerWidth = 240;

export default function Sidebar({ children }) {
    const router = useRouter();
    const pathname = usePathname();

    const menuItems = [
        { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
        { text: 'Academic Years', icon: <SchoolIcon />, path: '/dashboard/academic-years' },
        { text: 'Students', icon: <PeopleIcon />, path: '/dashboard/students' },
        { text: 'Enrollment', icon: <ClassIcon />, path: '/dashboard/enrollment' },
        { text: 'Fee Structures', icon: <FeesIcon />, path: '/dashboard/fees/structures' },
        { text: 'Fee Collection', icon: <ReceiptIcon />, path: '/dashboard/fees' },
    ];

    return (
        <Box sx={{ display: 'flex' }}>
            <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
                <Toolbar>
                    <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
                        School Admin
                    </Typography>
                    <LogoutButton />
                </Toolbar>
            </AppBar>
            <Drawer
                variant="permanent"
                sx={{
                    width: drawerWidth,
                    flexShrink: 0,
                    [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box' },
                }}
            >
                <Toolbar />
                <Box sx={{ overflow: 'auto' }}>
                    <List>
                        {menuItems.map((item) => (
                            <Link key={item.text} href={item.path} style={{ textDecoration: 'none', color: 'inherit' }}>
                                <ListItem disablePadding>
                                    <ListItemButton selected={pathname === item.path}>
                                        <ListItemIcon>
                                            {item.icon}
                                        </ListItemIcon>
                                        <ListItemText primary={item.text} />
                                    </ListItemButton>
                                </ListItem>
                            </Link>
                        ))}
                    </List>
                    <Divider />
                </Box>
            </Drawer>
            <Box component="main" sx={{ flexGrow: 1, p: 3, bgcolor: '#f5f5f5', minHeight: '100vh' }}>
                <Toolbar />
                {children}
            </Box>
        </Box>
    );
}
