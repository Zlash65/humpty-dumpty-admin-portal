import { cookies } from 'next/headers';
import { verifyAuthToken } from './auth';

export function getCurrentUsername() {
    try {
        const token = cookies().get('auth_token')?.value;
        const payload = verifyAuthToken(token);
        return payload?.username || 'system';
    } catch {
        return 'system';
    }
}

