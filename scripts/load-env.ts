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

export function loadEnvFiles(options: { rootDir?: string } = {}) {
    const rootDir = options.rootDir ?? path.join(__dirname, '..');
    const candidates = [path.join(rootDir, '.env.local'), path.join(rootDir, '.env')];

    const loaded: string[] = [];
    for (const candidatePath of candidates) {
        if (!fs.existsSync(candidatePath)) continue;
        dotenv.config({ path: candidatePath, override: false, quiet: true });
        loaded.push(candidatePath);
    }

    return loaded;
}

