import { NextResponse } from 'next/server';

export async function POST() {
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

    return response;
}
