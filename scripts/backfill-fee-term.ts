/**
 * Backfill Script: fee_transactions.fee_term
 *
 * Purpose:
 * - Older migrations (or manual inserts) may have fee_term blank.
 * - The UI expects a meaningful fee_term ('term1'|'term2'|'books') for parity with Electron.
 *
 * This script updates ONLY rows where fee_term is NULL/blank, inferring from breakdown columns.
 *
 * Usage:
 *   tsx scripts/backfill-fee-term.ts
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { loadEnvFiles } from './load-env';
import { sql } from '../lib/sql';
import { getPrisma } from '../lib/prisma';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnvFiles({ rootDir: path.join(__dirname, '..') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('DATABASE_URL is required (set in .env/.env.local)');
    process.exit(2);
}

function inferFromBreakdown(b: { t1: number; t2: number; bk: number }): 'term1' | 'term2' | 'books' {
    const t1 = Number(b.t1) || 0;
    const t2 = Number(b.t2) || 0;
    const bk = Number(b.bk) || 0;
    const positive = [t1 > 0, t2 > 0, bk > 0].filter(Boolean).length;
    if (positive === 1) {
        if (t2 > 0) return 'term2';
        if (bk > 0) return 'books';
        return 'term1';
    }
    // If mixed breakdown (rare), keep stable default.
    return 'term1';
}

async function main() {
    const prisma = getPrisma();
    try {
        const rows = await sql<Array<{
            id: string;
            breakdown_term1: string;
            breakdown_term2: string;
            breakdown_book_fee: string;
        }>>`
            SELECT id, breakdown_term1, breakdown_term2, breakdown_book_fee
            FROM fee_transactions
            WHERE fee_term IS NULL OR BTRIM(fee_term) = ''
            ORDER BY created_at ASC
        `;

        if (!rows.length) {
            console.log('✓ No blank fee_term rows found');
            return;
        }

        let updated = 0;
        for (const r of rows) {
            const feeTerm = inferFromBreakdown({
                t1: Number(r.breakdown_term1) || 0,
                t2: Number(r.breakdown_term2) || 0,
                bk: Number(r.breakdown_book_fee) || 0,
            });
            await sql`UPDATE fee_transactions SET fee_term = ${feeTerm} WHERE id = ${r.id}::uuid`;
            updated++;
        }

        console.log(`✓ Backfilled fee_term for ${updated} transaction(s)`);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
});
