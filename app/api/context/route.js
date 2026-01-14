import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const { branchId, academicYearId } = await request.json();

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
            response.cookies.set({
                name: 'academic_year_id',
                value: academicYearId ? String(academicYearId) : '',
                httpOnly: true,
                path: '/',
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                ...(academicYearId ? { maxAge: 60 * 60 * 24 * 365 } : { expires: new Date(0) }),
            });
        }

        return response;
    } catch (error) {
        return NextResponse.json(
            { ok: false, error: error?.message || 'Failed to set context' },
            { status: 400 }
        );
    }
}

