import { NextResponse, NextRequest } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';

export function proxy(request: NextRequest): NextResponse {
    const url = request.nextUrl;

    // Only protect dashboard routes
    if (!url.pathname.startsWith('/dashboard')) {
        return NextResponse.next();
    }

    const cookie = request.cookies.get('auth_token');
    const token = cookie?.value;
    const payload = verifyAuthToken(token);

    if (!payload) {
        return NextResponse.redirect(new URL('/', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/dashboard/:path*'],
};
