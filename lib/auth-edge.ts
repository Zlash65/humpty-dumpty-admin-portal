/**
 * Edge Runtime compatible auth token verification.
 * Uses Web Crypto API instead of Node.js crypto module.
 */

export interface AuthPayload {
    username: string;
    exp: number;
    iat: number;
    [key: string]: unknown;
}

function base64urlDecode(b64url: string): string {
    if (!b64url || typeof b64url !== 'string') return '';
    let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    // pad
    const padLen = (4 - (b64.length % 4)) % 4;
    b64 += '='.repeat(padLen);
    try {
        return atob(b64);
    } catch {
        return '';
    }
}

function base64urlEncode(str: string): string {
    try {
        return btoa(str)
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');
    } catch {
        return '';
    }
}

function getAuthSecret(): string {
    const secret = process.env.AUTH_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev-secret-change-me' : null);
    if (!secret) {
        throw new Error('AUTH_SECRET is not set (required in production).');
    }
    return secret;
}

async function hmacSha256Base64url(secret: string, data: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const dataBuffer = encoder.encode(data);

    const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, dataBuffer);
    const signatureArray = new Uint8Array(signature);

    // Convert to base64url
    let binary = '';
    for (let i = 0; i < signatureArray.length; i++) {
        binary += String.fromCharCode(signatureArray[i]);
    }
    return base64urlEncode(binary);
}

// Timing-safe comparison using Web Crypto
function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
}

export async function verifyAuthTokenEdge(token: string | null | undefined): Promise<AuthPayload | null> {
    if (!token || typeof token !== 'string') return null;

    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64url, sigB64url] = parts;
    if (!payloadB64url || !sigB64url) return null;

    let expected: string;
    try {
        expected = await hmacSha256Base64url(getAuthSecret(), payloadB64url);
    } catch {
        return null;
    }

    // timing-safe compare
    if (!timingSafeEqual(expected, sigB64url)) return null;

    const payloadStr = base64urlDecode(payloadB64url);
    if (!payloadStr) return null;

    let payload: AuthPayload;
    try {
        payload = JSON.parse(payloadStr);
    } catch {
        return null;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!payload?.exp || typeof payload.exp !== 'number') return null;
    if (payload.exp <= nowSeconds) return null;

    return payload;
}
