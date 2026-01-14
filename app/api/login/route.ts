import { NextResponse, NextRequest } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import bcrypt from 'bcryptjs';
import { signAuthToken } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

interface LoginRequestBody {
    username: string;
    password: string;
}

export async function POST(request: NextRequest) {
    try {
        const { username, password } = await request.json() as LoginRequestBody;

        if (!username || !password) {
            return NextResponse.json(
                { message: 'Username and password are required.' },
                { status: 400 }
            );
        }

        await dbConnect();

        const user = await User.findOne({ username });

        if (!user) {
            return NextResponse.json(
                { message: 'Invalid credentials.' },
                { status: 401 }
            );
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return NextResponse.json(
                { message: 'Invalid credentials.' },
                { status: 401 }
            );
        }

        const token = signAuthToken({
            userId: user._id.toString(),
            username: user.username,
        });

        const response = NextResponse.json({ message: 'Login successful' }, { status: 200 });

        response.cookies.set({
            name: 'auth_token',
            value: token,
            httpOnly: true,
            path: '/',
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7, // 1 week
        });

        await logAudit({
            action: 'login',
            entity: 'user',
            entityId: user._id,
            entityName: user.username,
            performedBy: user.username,
        });

        return response;

    } catch {
        return NextResponse.json(
            { message: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
