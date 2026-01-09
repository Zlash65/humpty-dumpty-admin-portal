import { Grid, Paper, Typography, Box } from '@mui/material';
import Link from 'next/link';
import SchoolIcon from '@mui/icons-material/School';
import PeopleIcon from '@mui/icons-material/People';
import ClassIcon from '@mui/icons-material/Class';
import ReceiptIcon from '@mui/icons-material/Receipt';

export default function DashboardPage() {
    const cards = [
        { title: 'Academic Years', desc: 'Manage school years', path: '/dashboard/academic-years', icon: <SchoolIcon fontSize="large" color="primary" /> },
        { title: 'Students', desc: 'Admission and Directory', path: '/dashboard/students', icon: <PeopleIcon fontSize="large" color="secondary" /> },
        { title: 'Enrollment', desc: 'Assign classes', path: '/dashboard/enrollment', icon: <ClassIcon fontSize="large" color="success" /> },
        { title: 'Fee Collection', desc: 'View records and pay', path: '/dashboard/fees', icon: <ReceiptIcon fontSize="large" color="warning" /> },
    ];

    return (
        <Box>
            <Typography variant="h4" fontWeight="bold" gutterBottom>
                Welcome Admin
            </Typography>
            <Typography variant="body1" color="text.secondary" mb={4}>
                Select a module to get started.
            </Typography>

            <Grid container spacing={3}>
                {cards.map((card) => (
                    <Grid item xs={12} sm={6} md={4} key={card.title}>
                        <Link href={card.path} style={{ textDecoration: 'none' }}>
                            <Paper
                                sx={{
                                    p: 3,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    transition: '0.3s',
                                    '&:hover': {
                                        transform: 'translateY(-5px)',
                                        boxShadow: 3
                                    }
                                }}
                            >
                                <Box mb={2}>{card.icon}</Box>
                                <Typography variant="h6" fontWeight="bold">{card.title}</Typography>
                                <Typography variant="body2" color="text.secondary">{card.desc}</Typography>
                            </Paper>
                        </Link>
                    </Grid>
                ))}
            </Grid>
        </Box>
    );
}
