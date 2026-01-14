'use client';

import { createTheme } from '@mui/material/styles';

// Color palette type definitions
interface ColorShades {
    50: string;
    100: string;
    200: string;
    300: string;
    400: string;
    500: string;
    600: string;
    700: string;
    800: string;
    900: string;
}

interface ThemePalette {
    indigo: ColorShades;
    slate: ColorShades;
    amber: ColorShades;
    emerald: ColorShades;
    rose: ColorShades;
}

// Professional & Warm Color Palette
const palette: ThemePalette = {
    // Deep indigo - Primary (professional, trustworthy)
    indigo: {
        50: '#f0f4ff',
        100: '#e0e7ff',
        200: '#c7d2fe',
        300: '#a5b4fc',
        400: '#818cf8',
        500: '#6366f1',
        600: '#4f46e5',
        700: '#4338ca',
        800: '#3730a3',
        900: '#312e81',
    },
    // Warm slate - Neutral
    slate: {
        50: '#f8fafc',
        100: '#f1f5f9',
        200: '#e2e8f0',
        300: '#cbd5e1',
        400: '#94a3b8',
        500: '#64748b',
        600: '#475569',
        700: '#334155',
        800: '#1e293b',
        900: '#0f172a',
    },
    // Soft amber - Accent (warm, welcoming)
    amber: {
        50: '#fffbeb',
        100: '#fef3c7',
        200: '#fde68a',
        300: '#fcd34d',
        400: '#fbbf24',
        500: '#f59e0b',
        600: '#d97706',
        700: '#b45309',
        800: '#92400e',
        900: '#78350f',
    },
    // Soft emerald - Success
    emerald: {
        50: '#ecfdf5',
        100: '#d1fae5',
        200: '#a7f3d0',
        300: '#6ee7b7',
        400: '#34d399',
        500: '#10b981',
        600: '#059669',
        700: '#047857',
        800: '#065f46',
        900: '#064e3b',
    },
    // Soft rose - Error/Warning accent
    rose: {
        50: '#fff1f2',
        100: '#ffe4e6',
        200: '#fecdd3',
        300: '#fda4af',
        400: '#fb7185',
        500: '#f43f5e',
        600: '#e11d48',
        700: '#be123c',
        800: '#9f1239',
        900: '#881337',
    },
};

const theme = createTheme({
    cssVariables: true,
    palette: {
        mode: 'light',
        primary: {
            light: palette.indigo[400],
            main: palette.indigo[600],
            dark: palette.indigo[700],
            contrastText: '#ffffff',
        },
        secondary: {
            light: palette.amber[400],
            main: palette.amber[500],
            dark: palette.amber[600],
            contrastText: '#ffffff',
        },
        success: {
            light: palette.emerald[400],
            main: palette.emerald[500],
            dark: palette.emerald[600],
            contrastText: '#ffffff',
        },
        warning: {
            light: palette.amber[300],
            main: palette.amber[500],
            dark: palette.amber[600],
            contrastText: '#ffffff',
        },
        error: {
            light: palette.rose[400],
            main: palette.rose[500],
            dark: palette.rose[600],
            contrastText: '#ffffff',
        },
        info: {
            light: palette.indigo[300],
            main: palette.indigo[500],
            dark: palette.indigo[600],
            contrastText: '#ffffff',
        },
        background: {
            default: palette.slate[50],
            paper: '#ffffff',
        },
        text: {
            primary: palette.slate[800],
            secondary: palette.slate[500],
        },
        divider: palette.slate[200],
    },
    typography: {
        fontFamily: 'var(--font-quicksand), "Quicksand", sans-serif',
        h1: {
            fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
            fontSize: '2.25rem',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
            color: palette.slate[800],
        },
        h2: {
            fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
            fontSize: '1.875rem',
            fontWeight: 700,
            letterSpacing: '-0.01em',
            lineHeight: 1.3,
            color: palette.slate[800],
        },
        h3: {
            fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
            fontSize: '1.5rem',
            fontWeight: 600,
            lineHeight: 1.3,
            color: palette.slate[800],
        },
        h4: {
            fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
            fontSize: '1.25rem',
            fontWeight: 600,
            lineHeight: 1.4,
            color: palette.slate[800],
        },
        h5: {
            fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
            fontSize: '1.1rem',
            fontWeight: 600,
            lineHeight: 1.4,
            color: palette.slate[800],
        },
        h6: {
            fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
            fontSize: '1rem',
            fontWeight: 600,
            lineHeight: 1.5,
            color: palette.slate[800],
        },
        subtitle1: {
            fontSize: '1rem',
            fontWeight: 500,
            lineHeight: 1.5,
        },
        subtitle2: {
            fontSize: '0.875rem',
            fontWeight: 600,
            lineHeight: 1.5,
        },
        body1: {
            fontSize: '0.95rem',
            fontWeight: 500,
            lineHeight: 1.6,
        },
        body2: {
            fontSize: '0.875rem',
            fontWeight: 500,
            lineHeight: 1.6,
        },
        button: {
            fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
            fontSize: '0.875rem',
            fontWeight: 600,
            textTransform: 'none',
            letterSpacing: '0.01em',
        },
        caption: {
            fontSize: '0.75rem',
            fontWeight: 500,
            lineHeight: 1.5,
            color: palette.slate[500],
        },
        overline: {
            fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
            fontSize: '0.7rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: palette.slate[500],
        },
    },
    shape: {
        borderRadius: 8,
    },
    shadows: [
        'none',
        '0 1px 2px rgba(0, 0, 0, 0.05)',
        '0 1px 3px rgba(0, 0, 0, 0.1)',
        '0 4px 6px rgba(0, 0, 0, 0.07)',
        '0 5px 10px rgba(0, 0, 0, 0.08)',
        '0 10px 15px rgba(0, 0, 0, 0.1)',
        '0 10px 20px rgba(0, 0, 0, 0.1)',
        '0 15px 25px rgba(0, 0, 0, 0.1)',
        '0 15px 30px rgba(0, 0, 0, 0.12)',
        '0 20px 35px rgba(0, 0, 0, 0.12)',
        '0 20px 40px rgba(0, 0, 0, 0.14)',
        '0 25px 45px rgba(0, 0, 0, 0.14)',
        '0 25px 50px rgba(0, 0, 0, 0.15)',
        '0 30px 55px rgba(0, 0, 0, 0.15)',
        '0 30px 60px rgba(0, 0, 0, 0.16)',
        '0 35px 65px rgba(0, 0, 0, 0.16)',
        '0 35px 70px rgba(0, 0, 0, 0.17)',
        '0 40px 75px rgba(0, 0, 0, 0.17)',
        '0 40px 80px rgba(0, 0, 0, 0.18)',
        '0 45px 85px rgba(0, 0, 0, 0.18)',
        '0 45px 90px rgba(0, 0, 0, 0.19)',
        '0 50px 95px rgba(0, 0, 0, 0.19)',
        '0 50px 100px rgba(0, 0, 0, 0.2)',
        '0 55px 105px rgba(0, 0, 0, 0.2)',
        '0 55px 110px rgba(0, 0, 0, 0.21)',
    ],
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                body: {
                    backgroundColor: palette.slate[50],
                    minHeight: '100vh',
                },
            },
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 8,
                    padding: '8px 20px',
                    boxShadow: 'none',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    },
                },
                contained: {
                    '&:hover': {
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                    },
                },
                outlined: {
                    borderWidth: 1.5,
                    '&:hover': {
                        borderWidth: 1.5,
                    },
                },
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    borderRadius: 12,
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
                    border: `1px solid ${palette.slate[200]}`,
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    borderRadius: 12,
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                },
                elevation1: {
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
                },
                elevation2: {
                    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.1)',
                },
                elevation3: {
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                },
            },
        },
        MuiTextField: {
            defaultProps: {
                variant: 'outlined',
                size: 'small',
            },
            styleOverrides: {
                root: {
                    '& .MuiOutlinedInput-root': {
                        borderRadius: 8,
                        backgroundColor: '#ffffff',
                        '& fieldset': {
                            borderColor: palette.slate[300],
                        },
                        '&:hover fieldset': {
                            borderColor: palette.indigo[400],
                        },
                        '&.Mui-focused fieldset': {
                            borderColor: palette.indigo[500],
                        },
                    },
                },
            },
        },
        MuiChip: {
            styleOverrides: {
                root: {
                    borderRadius: 6,
                    fontWeight: 600,
                    fontSize: '0.8rem',
                },
            },
        },
        MuiTableContainer: {
            styleOverrides: {
                root: {
                    borderRadius: 12,
                    border: `1px solid ${palette.slate[200]}`,
                    boxShadow: 'none',
                },
            },
        },
        MuiTableHead: {
            styleOverrides: {
                root: {
                    '& .MuiTableCell-head': {
                        backgroundColor: palette.slate[50],
                        fontWeight: 600,
                        fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
                        fontSize: '0.8rem',
                        color: palette.slate[600],
                        borderBottom: `2px solid ${palette.slate[200]}`,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                    },
                },
            },
        },
        MuiTableRow: {
            styleOverrides: {
                root: {
                    '&:hover': {
                        backgroundColor: palette.slate[50],
                    },
                },
            },
        },
        MuiTableCell: {
            styleOverrides: {
                root: {
                    borderBottom: `1px solid ${palette.slate[100]}`,
                    padding: '14px 16px',
                },
            },
        },
        MuiDialog: {
            styleOverrides: {
                paper: {
                    borderRadius: 16,
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
                },
            },
        },
        MuiDialogTitle: {
            styleOverrides: {
                root: {
                    fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
                    fontWeight: 600,
                    fontSize: '1.25rem',
                    color: palette.slate[800],
                },
            },
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                    borderRadius: 0,
                },
            },
        },
        MuiDrawer: {
            styleOverrides: {
                paper: {
                    borderRight: `1px solid ${palette.slate[200]}`,
                    boxShadow: 'none',
                },
            },
        },
        MuiListItemButton: {
            styleOverrides: {
                root: {
                    borderRadius: 8,
                    margin: '2px 8px',
                    '&:hover': {
                        backgroundColor: palette.slate[100],
                    },
                    '&.Mui-selected': {
                        backgroundColor: palette.indigo[50],
                        '&:hover': {
                            backgroundColor: palette.indigo[100],
                        },
                    },
                },
            },
        },
        MuiAlert: {
            styleOverrides: {
                root: {
                    borderRadius: 8,
                    fontWeight: 500,
                },
            },
        },
        MuiTooltip: {
            styleOverrides: {
                tooltip: {
                    backgroundColor: palette.slate[800],
                    borderRadius: 6,
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    padding: '6px 12px',
                },
            },
        },
        MuiIconButton: {
            styleOverrides: {
                root: {
                    '&:hover': {
                        backgroundColor: palette.slate[100],
                    },
                },
            },
        },
        MuiDivider: {
            styleOverrides: {
                root: {
                    borderColor: palette.slate[200],
                },
            },
        },
    },
});

export default theme;
