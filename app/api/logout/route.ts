import { NextResponse, NextRequest } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function POST(request: NextRequest) {
    const token = request.cookies.get('auth_token')?.value;
    const payload = verifyAuthToken(token);

    const response = NextResponse.json({ message: 'Logged out successfully' }, { status: 200 });

    response.cookies.set({
        name: 'auth_token',
        value: '',
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        expires: new Date(0), // Set expiration to the past
    });

    if (payload?.userId || payload?.username) {
        await logAudit({
            action: 'logout',
            entity: 'user',
            entityId: payload?.userId as string | undefined,
            entityName: payload?.username as string | undefined,
            performedBy: (payload?.username as string | undefined) || 'system',
        });
    }

    return response;
}
