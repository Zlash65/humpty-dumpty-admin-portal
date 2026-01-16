import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyAuthToken, type AuthPayload } from '@/lib/auth';

function getCookieValueFromHeader(cookieHeader: string | null | undefined, name: string): string | null {
    const header = String(cookieHeader || '').trim();
    if (!header) return null;

    for (const part of header.split(';')) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx <= 0) continue;
        const k = trimmed.slice(0, eqIdx).trim();
        if (k !== name) continue;
        const v = trimmed.slice(eqIdx + 1);
        try {
            return decodeURIComponent(v);
        } catch {
            return v;
        }
    }

    return null;
}

function getAuthTokenFromRequest(request: NextRequest | Request): string | null {
    // NextRequest provides parsed cookies; fall back to raw header parsing for standard Request.
    const maybeCookies = (request as Partial<NextRequest>)?.cookies;
    const token =
        typeof maybeCookies?.get === 'function'
            ? maybeCookies.get('auth_token')?.value
            : getCookieValueFromHeader(request.headers.get('cookie'), 'auth_token');
    return token || null;
}

export async function requireDashboardAuth(): Promise<AuthPayload> {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    const payload = verifyAuthToken(token);
    if (!payload) redirect('/');
    return payload;
}

export function requireApiAuth(request: NextRequest | Request):
    | { ok: true; payload: AuthPayload }
    | { ok: false; response: Response } {
    const token = getAuthTokenFromRequest(request);
    const payload = verifyAuthToken(token);
    if (!payload) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: 'Unauthorized', message: 'Authentication required' },
                { status: 401 }
            ),
        };
    }
    return { ok: true, payload };
}

