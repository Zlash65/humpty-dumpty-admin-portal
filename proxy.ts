import { NextResponse, NextRequest } from 'next/server';
import { verifyAuthTokenEdge } from '@/lib/auth-edge';

/**
 * Next.js Proxy (formerly Middleware) for authentication protection.
 *
 * Protects:
 * - /dashboard/:path* - All dashboard pages
 * - /api/export/:path* - Export endpoints
 * - /api/students/:path* - Student search/directory endpoints
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
    const url = request.nextUrl;
    const pathname = url.pathname;

    // Get auth token from cookie
    const cookie = request.cookies.get('auth_token');
    const token = cookie?.value;
    const payload = await verifyAuthTokenEdge(token);

    // Check if this is a protected dashboard route
    if (pathname.startsWith('/dashboard')) {
        if (!payload) {
            // Redirect to login page
            return NextResponse.redirect(new URL('/', request.url));
        }
        return NextResponse.next();
    }

    // Check if this is a protected API route
    const protectedApiPaths = [
        '/api/export',
        '/api/students/search',
        '/api/students/directory-search',
    ];

    const isProtectedApi = protectedApiPaths.some(path => pathname.startsWith(path));

    if (isProtectedApi) {
        if (!payload) {
            // Return 401 for API routes
            return NextResponse.json(
                { error: 'Unauthorized', message: 'Authentication required' },
                { status: 401 }
            );
        }
        return NextResponse.next();
    }

    // Allow all other requests
    return NextResponse.next();
}

export const config = {
    matcher: [
        // Dashboard routes
        '/dashboard/:path*',
        // Protected API routes
        '/api/context',
        '/api/export/:path*',
        '/api/students/search',
        '/api/students/directory-search',
    ],
};
