'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';

export default function LogoutButton() {
    const router = useRouter();

    const handleLogout = async () => {
        try {
            const res = await fetch('/api/logout', {
                method: 'POST',
            });

            if (res.ok) {
                router.push('/');
                router.refresh();
            }
        } catch {
            // Logout failed silently
        }
    };

    return (
        <Button
            onClick={handleLogout}
            startIcon={<LogoutIcon sx={{ fontSize: 18 }} />}
            sx={{
                color: '#94a3b8',
                fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
                fontWeight: 600,
                fontSize: '0.85rem',
                px: 2,
                py: 0.75,
                borderRadius: 2,
                '&:hover': {
                    bgcolor: 'rgba(255, 255, 255, 0.1)',
                    color: 'white',
                },
            }}
        >
            Logout
        </Button>
    );
}
