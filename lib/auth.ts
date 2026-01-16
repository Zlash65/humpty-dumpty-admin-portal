import crypto from 'crypto';

export interface AuthPayload {
    username: string;
    exp: number;
    iat: number;
    [key: string]: unknown;
}

interface SignOptions {
    maxAgeSeconds?: number;
}

function base64urlEncode(input: Buffer | string): string {
    const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
    return buf
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function base64urlDecodeToBuffer(b64url: string | null | undefined): Buffer | null {
    if (!b64url || typeof b64url !== 'string') return null;
    let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    // pad
    const padLen = (4 - (b64.length % 4)) % 4;
    b64 += '='.repeat(padLen);
    try {
        return Buffer.from(b64, 'base64');
    } catch {
        return null;
    }
}

function getAuthSecret(): string {
    const secret = process.env.AUTH_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev-secret-change-me' : null);
    if (!secret) {
        throw new Error('AUTH_SECRET is not set (required in production).');
    }
    return secret;
}

function hmacSha256Base64url(secret: string, payloadB64url: string): string {
    const h = crypto.createHmac('sha256', secret);
    h.update(payloadB64url);
    return base64urlEncode(h.digest());
}

export function signAuthToken(payload: Partial<AuthPayload> & { username: string }, { maxAgeSeconds = 60 * 60 * 24 * 7 }: SignOptions = {}): string {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const exp = nowSeconds + maxAgeSeconds;

    const cleanPayload: AuthPayload = {
        ...payload,
        username: payload.username,
        exp,
        iat: nowSeconds,
    };

    const payloadB64url = base64urlEncode(JSON.stringify(cleanPayload));
    const sigB64url = hmacSha256Base64url(getAuthSecret(), payloadB64url);
    return `${payloadB64url}.${sigB64url}`;
}

export function verifyAuthToken(token: string | null | undefined): AuthPayload | null {
    if (!token || typeof token !== 'string') return null;

    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64url, sigB64url] = parts;
    if (!payloadB64url || !sigB64url) return null;

    let expected: string;
    try {
        expected = hmacSha256Base64url(getAuthSecret(), payloadB64url);
    } catch {
        return null;
    }

    // timing-safe compare
    const a = Buffer.from(expected);
    const b = Buffer.from(sigB64url);
    if (a.length !== b.length) return null;
    try {
        if (!crypto.timingSafeEqual(a, b)) return null;
    } catch {
        return null;
    }

    const payloadBuf = base64urlDecodeToBuffer(payloadB64url);
    if (!payloadBuf) return null;
    let payload: AuthPayload;
    try {
        payload = JSON.parse(payloadBuf.toString('utf8'));
    } catch {
        return null;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!payload?.exp || typeof payload.exp !== 'number') return null;
    if (payload.exp <= nowSeconds) return null;

    return payload;
}
