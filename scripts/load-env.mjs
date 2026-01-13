/**
 * Loads environment variables for local scripts.
 *
 * Next.js already loads `.env*` files for the app runtime, but Node scripts
 * (migration/index/verification) need to load env files themselves.
 *
 * Precedence matches Next.js conventions:
 *   1) real process environment (already in `process.env`)
 *   2) `.env.local`
 *   3) `.env`
 *
 * We intentionally DO NOT override existing `process.env` values.
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function loadEnvFiles({ rootDir = path.join(__dirname, '..') } = {}) {
    const candidates = [
        path.join(rootDir, '.env.local'),
        path.join(rootDir, '.env'),
    ];

    const loaded = [];
    for (const p of candidates) {
        if (!fs.existsSync(p)) continue;
        dotenv.config({ path: p, override: false, quiet: true });
        loaded.push(p);
    }

    return loaded;
}

