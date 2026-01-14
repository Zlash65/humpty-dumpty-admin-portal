import { cookies } from 'next/headers';
import { verifyAuthToken } from './auth';

export async function getCurrentUsername(): Promise<string> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const payload = verifyAuthToken(token);
        return payload?.username || 'system';
    } catch {
        return 'system';
    }
}
