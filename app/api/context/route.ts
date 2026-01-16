import { NextResponse, NextRequest } from 'next/server';
import { requireApiAuth } from '@/lib/authGuards';

interface ContextRequestBody {
    branchId?: string;
    academicYearId?: string;
}

export async function POST(request: NextRequest) {
    try {
        const auth = requireApiAuth(request);
        if (auth.ok === false) return auth.response;

        const { branchId, academicYearId } = await request.json() as ContextRequestBody;

        const response = NextResponse.json({ ok: true }, { status: 200 });

        // Persist selection similar to Electron's in-app context.
        // These cookies are used by server components/actions as defaults.
        if (branchId !== undefined) {
            response.cookies.set({
                name: 'branch_id',
                value: branchId ? String(branchId) : '',
                httpOnly: true,
                path: '/',
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                ...(branchId ? { maxAge: 60 * 60 * 24 * 365 } : { expires: new Date(0) }),
            });
        }

        if (academicYearId !== undefined) {
            // Academic year uses session cookie (no maxAge) so fresh sessions default
            // to the active year. The Sidebar uses sessionStorage for in-tab persistence.
            response.cookies.set({
                name: 'academic_year_id',
                value: academicYearId ? String(academicYearId) : '',
                httpOnly: true,
                path: '/',
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                // Session cookie: cleared when browser closes so new sessions default to active year
                ...(academicYearId ? {} : { expires: new Date(0) }),
            });
        }

        return response;
    } catch (error) {
        return NextResponse.json(
            { ok: false, error: (error as Error)?.message || 'Failed to set context' },
            { status: 400 }
        );
    }
}
