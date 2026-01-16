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
    Menu as MenuIcon,
} from '@mui/icons-material';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import LogoutButton from '@/app/dashboard/LogoutButton';
import SearchableSelect, { type SearchableSelectOption } from '@/components/ui/SearchableSelect';

const drawerWidth = 260;

interface Branch {
    _id: string;
    name?: string;
}

interface AcademicYear {
    _id: string;
    name?: string;
    isActive?: boolean;
}

interface Settings {
    schoolName?: string;
}

interface MenuItem {
    text: string;
    icon: React.ReactNode;
    path: string;
}

interface SidebarProps {
    children: React.ReactNode;
    settings?: Settings;
    branches?: Branch[];
    years?: AcademicYear[];
    selectedBranchId?: string;
    selectedAcademicYearId?: string;
}

export default function Sidebar({
    children,
    settings,
    branches = [],
    years = [],
    selectedBranchId = '',
    selectedAcademicYearId = ''
}: SidebarProps) {
    const schoolName = settings?.schoolName || 'School';
    const pathname = usePathname();
    const router = useRouter();

    const [branchId, setBranchId] = React.useState(selectedBranchId);
    const [academicYearId, setAcademicYearId] = React.useState(selectedAcademicYearId);
    const [mobileOpen, setMobileOpen] = React.useState(false);

    const ACADEMIC_YEAR_STORAGE_KEY = 'hd_context_academic_year_id';

    const appBarContextTextFieldProps = React.useMemo(() => {
        return {
            variant: 'outlined' as const,
            slotProps: {
                inputLabel: { shrink: true },
            },
            sx: {
                '& .MuiInputLabel-root': {
                    color: '#cbd5e1',
                },
                '& .MuiInputLabel-root.Mui-focused': {
                    color: '#e2e8f0',
                },
                '& .MuiInputLabel-root.MuiInputLabel-shrink': {
                    transform: 'translate(14px, -6px) scale(0.75)',
                },
                '& .MuiOutlinedInput-root': {
                    color: 'white',
                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                    borderRadius: 2,
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#334155' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#475569' },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#818cf8' },
                    '& input::placeholder': { color: '#94a3b8', opacity: 1 },
                },
                '& .MuiAutocomplete-popupIndicator': {
                    color: '#cbd5e1',
                },
                '& .MuiAutocomplete-clearIndicator': {
                    color: '#cbd5e1',
                },
            },
        };
    }, []);

    const branchOptions = React.useMemo<SearchableSelectOption[]>(
        () =>
            (branches || []).map((b) => ({
                value: b._id,
                label: b.name || '',
                keywords: b.name || '',
            })),
        [branches]
    );

    const yearOptions = React.useMemo<SearchableSelectOption[]>(
        () =>
            (years || []).map((y) => ({
                value: y._id,
                label: `${y.name || ''}${y.isActive ? ' (Active)' : ''}`.trim(),
                keywords: y.name || '',
            })),
        [years]
    );

    const activeOrMostRecentYearId = React.useMemo(() => {
        const active = (years || []).find((y) => y.isActive)?._id || '';
        return active || (years?.[0]?._id || '');
    }, [years]);

    React.useEffect(() => {
        setBranchId(selectedBranchId);
    }, [selectedBranchId]);

    const persistContext = React.useCallback(
        async (next: { branchId?: string; academicYearId?: string }) => {
            await fetch('/api/context', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(next),
            });
            router.refresh();
        },
        [router]
    );

    React.useEffect(() => {
        // Academic year behavior:
        // - When a tab is opened/re-opened, default to the active (or most recent) year.
        // - Within the same tab, keep the user's selection via sessionStorage.
        //
        // We still use the cookie as the server-side transport, but sessionStorage decides what
        // the tab "wants" on mount.
        if (typeof window === 'undefined') return;
        if (!years?.length) return;

        const validIds = new Set((years || []).map((y) => String(y._id)));
        const stored = window.sessionStorage.getItem(ACADEMIC_YEAR_STORAGE_KEY) || '';
        const storedValid = stored && validIds.has(String(stored));
        if (stored && !storedValid) {
            window.sessionStorage.removeItem(ACADEMIC_YEAR_STORAGE_KEY);
        }

        const desired = (storedValid ? stored : activeOrMostRecentYearId) || '';
        if (!desired) return;

        if (desired !== academicYearId) setAcademicYearId(desired);
        if (desired !== selectedAcademicYearId) {
            void persistContext({ academicYearId: desired });
        }
    }, [years, activeOrMostRecentYearId, selectedAcademicYearId, academicYearId, persistContext]);

    // Electron parity: keep the primary navigation order and labels the same as the Electron app.
    const primaryMenuItems: MenuItem[] = [
        { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
        { text: 'Students', icon: <PeopleIcon />, path: '/dashboard/students' },
        { text: 'Classes', icon: <ClassIcon />, path: '/dashboard/classes' },
        { text: 'Staff', icon: <StaffIcon />, path: '/dashboard/staff' },
        { text: 'Transport', icon: <TransportIcon />, path: '/dashboard/transport' },
        { text: 'Fees', icon: <ReceiptIcon />, path: '/dashboard/fees' },
    ];

    // Extra admin capabilities (web-only). Kept, but separated so the core Electron flow is unchanged.
    const adminMenuItems: MenuItem[] = [
        { text: 'Enrollment', icon: <ClassIcon />, path: '/dashboard/enrollment' },
        { text: 'Branches', icon: <BranchIcon />, path: '/dashboard/branches' },
        { text: 'Academic Years', icon: <SchoolIcon />, path: '/dashboard/academic-years' },
        { text: 'Settings', icon: <SettingsIcon />, path: '/dashboard/settings' },
        { text: 'Audit Log', icon: <AuditIcon />, path: '/dashboard/audit' },
    ];

    const renderMenuItem = (item: MenuItem) => {
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

    const renderMenuSection = (title: string, items: MenuItem[]) => (
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
                    overflow: 'visible',
                }}
            >
                <Toolbar sx={{ gap: 1, px: { xs: 1, sm: 2 }, overflow: 'visible' }}>
                    {/* Mobile hamburger menu */}
                    <IconButton
                        color="inherit"
                        edge="start"
                        onClick={() => setMobileOpen(!mobileOpen)}
                        sx={{ mr: 1, display: { md: 'none' } }}
                    >
                        <MenuIcon />
                    </IconButton>

                    {/* Logo */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 1.5 } }}>
                        <Box
                            sx={{
                                width: { xs: 32, sm: 36 },
                                height: { xs: 32, sm: 36 },
                                borderRadius: 2,
                                bgcolor: '#4f46e5',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <SchoolIcon sx={{ fontSize: { xs: 18, sm: 22 }, color: 'white' }} />
                        </Box>
                        <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                            <Typography
                                variant="h6"
                                noWrap
                                sx={{
                                    fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
                                    fontWeight: 700,
                                    fontSize: { xs: '0.95rem', sm: '1.1rem' },
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
                    <Box sx={{ display: { xs: 'none', lg: 'flex' }, alignItems: 'center', gap: 2, ml: 4 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Box sx={{ minWidth: 220 }}>
                                <SearchableSelect
                                    label="Branch"
                                    placeholder="Select branch"
                                    value={branchId}
                                    onChange={async (next) => {
                                        setBranchId(next);
                                        await persistContext({ branchId: next });
                                    }}
                                    options={branchOptions}
                                    disableClearable
                                    minSearchChars={0}
                                    textFieldProps={appBarContextTextFieldProps}
                                />
                            </Box>
                            <Tooltip title="Manage branches">
                                <IconButton
                                    size="small"
                                    onClick={() => router.push('/dashboard/branches')}
                                    sx={{ color: '#cbd5e1' }}
                                >
                                    <SettingsIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        </Box>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Box sx={{ minWidth: 220 }}>
                                <SearchableSelect
                                    label="Academic Year"
                                    placeholder="Select year"
                                    value={academicYearId}
                                    onChange={async (next) => {
                                        setAcademicYearId(next);
                                        if (typeof window !== 'undefined') {
                                            window.sessionStorage.setItem(ACADEMIC_YEAR_STORAGE_KEY, String(next || ''));
                                        }
                                        await persistContext({ academicYearId: next });
                                    }}
                                    options={yearOptions}
                                    disableClearable
                                    minSearchChars={0}
                                    textFieldProps={appBarContextTextFieldProps}
                                />
                            </Box>
                            <Tooltip title="Manage academic years">
                                <IconButton
                                    size="small"
                                    onClick={() => router.push('/dashboard/academic-years')}
                                    sx={{ color: '#cbd5e1' }}
                                >
                                    <SettingsIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        </Box>
                    </Box>

                    <Box sx={{ flexGrow: 1 }} />

                    <LogoutButton />
                </Toolbar>
            </AppBar>

            {/* Mobile Drawer */}
            <Drawer
                variant="temporary"
                open={mobileOpen}
                onClose={() => setMobileOpen(false)}
                ModalProps={{
                    keepMounted: true,
                }}
                sx={{
                    display: { xs: 'block', md: 'none' },
                    [`& .MuiDrawer-paper`]: {
                        width: drawerWidth,
                        boxSizing: 'border-box',
                        bgcolor: '#ffffff',
                    },
                }}
            >
                <Toolbar />
                <Box sx={{ overflow: 'auto', py: 1 }}>
                    {/* Mobile Context Selectors */}
                    <Box sx={{ px: 2, pb: 2, pt: 1 }}>
                        <Box sx={{ mb: 1.5 }}>
                            <SearchableSelect
                                label="Branch"
                                placeholder="Select branch"
                                value={branchId}
                                onChange={async (next) => {
                                    setBranchId(next);
                                    await persistContext({ branchId: next });
                                    setMobileOpen(false);
                                }}
                                options={branchOptions}
                                disableClearable
                            />
                        </Box>
                        <SearchableSelect
                            label="Academic Year"
                            placeholder="Select year"
                            value={academicYearId}
                            onChange={async (next) => {
                                setAcademicYearId(next);
                                if (typeof window !== 'undefined') {
                                    window.sessionStorage.setItem(ACADEMIC_YEAR_STORAGE_KEY, String(next || ''));
                                }
                                await persistContext({ academicYearId: next });
                                setMobileOpen(false);
                            }}
                            options={yearOptions}
                            disableClearable
                        />
                    </Box>
                    <Divider sx={{ my: 1, mx: 2, borderColor: '#f1f5f9' }} />
                    {renderMenuSection('Main', primaryMenuItems)}
                    <Divider sx={{ my: 1, mx: 2, borderColor: '#f1f5f9' }} />
                    {renderMenuSection('Admin', adminMenuItems)}
                </Box>
            </Drawer>

            {/* Desktop Drawer */}
            <Drawer
                variant="permanent"
                sx={{
                    display: { xs: 'none', md: 'block' },
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
                    p: { xs: 2, sm: 3 },
                    bgcolor: '#f8fafc',
                    minHeight: '100vh',
                    minWidth: 0,
                    overflowX: 'hidden',
                    width: '100%',
                }}
            >
                <Toolbar />
                {children}
            </Box>
        </Box>
    );
}
