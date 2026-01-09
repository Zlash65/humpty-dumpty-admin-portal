'use client';

import { useRouter } from 'next/navigation';
import Button from '@mui/material/Button';
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
        } catch (error) {
            console.error('Logout failed:', error);
        }
    };

    return (
        <Button
            color="inherit"
            startIcon={<LogoutIcon />}
            onClick={handleLogout}
        >
            Logout
        </Button>
    );
}
