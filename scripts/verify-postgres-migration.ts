/**
 * Verification Script: SQLite (Electron) -> Postgres
 *
 * Usage:
 *   npm run verify:migration -- /path/to/school.db
 *
 * This script validates that the migrated Postgres database is consistent with:
 * - the SQLite production DB (counts + basic integrity)
 * - the runtime expectations of the Next.js app (receipt uniqueness, fee record integrity)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadEnvFiles } from './load-env';
import { sql, type SqlTag } from '../lib/sql';
import { getPrisma } from '../lib/prisma';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnvFiles({ rootDir: path.join(__dirname, '..') });

function parseArgs(argv: string[]) {
    const args = { sqlitePath: '' };
    for (const a of argv.slice(2)) {
        if (!args.sqlitePath && !a.startsWith('-')) args.sqlitePath = a;
    }
    return args;
}

async function assertSchemaExists(sql: SqlTag) {
    try {
        await sql`SELECT 1 FROM branches LIMIT 1`;
    } catch (e: any) {
        const msg = String(e?.message || e || '');
        if (msg.toLowerCase().includes('relation') && msg.toLowerCase().includes('does not exist')) {
            console.error('Postgres schema missing. Run: npm run db:setup');
            process.exit(2);
        }
        throw e;
    }
}

type SqliteDb = {
    prepare: (sql: string) => { get: (...args: any[]) => any };
};

function tableExists(sqliteDb: SqliteDb, tableName: string): boolean {
    try {
        const row = sqliteDb.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(tableName) as any;
        return !!row;
    } catch {
        return false;
    }
}

function formatResult(ok: boolean) {
    return ok ? '✓' : '✗';
}

async function main() {
    const prisma = getPrisma();
    const { sqlitePath } = parseArgs(process.argv);
    if (!sqlitePath) {
        console.error('Usage: npm run verify:migration -- /path/to/school.db');
        process.exit(2);
    }
    if (!fs.existsSync(sqlitePath)) {
        console.error(`SQLite DB not found: ${sqlitePath}`);
        process.exit(2);
    }

    const DATABASE_URL = process.env.DATABASE_URL;
    if (!DATABASE_URL) {
        console.error('DATABASE_URL is required (set in .env/.env.local or deployment environment)');
        process.exit(2);
    }
    try {
        await assertSchemaExists(sql);

        let SqliteDatabase: any;
        try {
            const mod: any = await import('better-sqlite3');
            SqliteDatabase = mod?.default || mod;
        } catch {
            console.error('better-sqlite3 is required to read the SQLite database for verification.');
            console.error('Install it (include optional deps): npm install --include=optional');
            process.exit(2);
        }

        const sqliteDb = new SqliteDatabase(sqlitePath, { readonly: true, fileMustExist: true }) as SqliteDb;

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║   Verify SQLite → Postgres Migration                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`SQLite: ${sqlitePath}`);

    // SQLite counts
    const sqliteTransportTable = tableExists(sqliteDb, 'transports') ? 'transports' : (tableExists(sqliteDb, 'transport') ? 'transport' : null);
    const sqliteCounts = {
        branches: sqliteDb.prepare('SELECT COUNT(*) AS n FROM branches').get() as any,
        years: sqliteDb.prepare('SELECT COUNT(*) AS n FROM academic_years').get() as any,
        classes: sqliteDb.prepare('SELECT COUNT(*) AS n FROM classes').get() as any,
        students: sqliteDb.prepare('SELECT COUNT(*) AS n FROM students').get() as any,
        staff: sqliteDb.prepare('SELECT COUNT(*) AS n FROM staff').get() as any,
        teacherAssignments: sqliteDb.prepare('SELECT COUNT(*) AS n FROM teacher_assignments').get() as any,
        transports: sqliteTransportTable ? (sqliteDb.prepare(`SELECT COUNT(*) AS n FROM ${sqliteTransportTable}`).get() as any) : { n: 0 },
        fees: sqliteDb.prepare('SELECT COUNT(*) AS n FROM fees').get() as any,
        activeYears: sqliteDb.prepare('SELECT COUNT(*) AS n FROM academic_years WHERE is_active = 1').get() as any,
        feeTotals: sqliteDb.prepare(
            `SELECT 
                ROUND(COALESCE(SUM(amount),0), 2) AS total_amount,
                COALESCE(SUM(CASE WHEN payment_type='cash' THEN amount ELSE 0 END), 0) AS cash_amount,
                COALESCE(SUM(CASE WHEN payment_type='bank' THEN amount ELSE 0 END), 0) AS bank_amount,
                COALESCE(SUM(CASE WHEN payment_type='cash' THEN 1 ELSE 0 END), 0) AS cash_count,
                COALESCE(SUM(CASE WHEN payment_type='bank' THEN 1 ELSE 0 END), 0) AS bank_count
            FROM fees`
        ).get() as any,
    };

    // Postgres counts
    const [pgBranches, pgYears, pgFeeStructures, pgStudents, pgEnrollments, pgFeeRecords, pgFeeTx, pgStaff, pgTransports] =
        await Promise.all([
            sql<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM branches`,
            sql<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM academic_years`,
            sql<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM fee_structures`,
            sql<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM students`,
            sql<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM student_enrollments`,
            sql<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM fee_records`,
            sql<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM fee_transactions`,
            sql<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM staff`,
            sql<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM transports`,
        ]);

    const pgCounts = {
        branches: pgBranches?.[0]?.n || 0,
        years: pgYears?.[0]?.n || 0,
        feeStructures: pgFeeStructures?.[0]?.n || 0,
        students: pgStudents?.[0]?.n || 0,
        enrollments: pgEnrollments?.[0]?.n || 0,
        feeRecords: pgFeeRecords?.[0]?.n || 0,
        feeTransactions: pgFeeTx?.[0]?.n || 0,
        staff: pgStaff?.[0]?.n || 0,
        transports: pgTransports?.[0]?.n || 0,
    };

    const expectedFeeStructures = (Number(sqliteCounts.classes.n) || 0) * (Number(pgCounts.years) || 0);

    console.log('\n**Counts**');
    console.log(`SQLite branches=${sqliteCounts.branches.n} years=${sqliteCounts.years.n} classes=${sqliteCounts.classes.n} students=${sqliteCounts.students.n} staff=${sqliteCounts.staff.n} transports=${sqliteCounts.transports.n} fees=${sqliteCounts.fees.n}`);
    console.log(`Postgres branches=${pgCounts.branches} years=${pgCounts.years} fee_structures=${pgCounts.feeStructures} students=${pgCounts.students} enrollments=${pgCounts.enrollments} fee_records=${pgCounts.feeRecords} fee_transactions=${pgCounts.feeTransactions} staff=${pgCounts.staff} transports=${pgCounts.transports}`);
    console.log(`Expected fee_structures ~= sqlite_classes(${sqliteCounts.classes.n}) * years(${pgCounts.years}) = ${expectedFeeStructures}`);

    const okFeesCount = Number(sqliteCounts.fees.n) === pgCounts.feeTransactions;
    const okStudentsCount = Number(sqliteCounts.students.n) === pgCounts.students;
    const okYearsActive = Number(sqliteCounts.activeYears.n) >= 1;

    console.log('\n**High-signal checks**');
    console.log(`${formatResult(okFeesCount)} fee transactions count matches SQLite fees`);
    console.log(`${formatResult(okStudentsCount)} students count matches SQLite students`);
    console.log(`${formatResult(okYearsActive)} SQLite has an active academic year`);

    // Fee totals parity (strong signal)
    const pgTotalsRows = await sql<Array<{ total_amount: number; cash_amount: number; non_cash_amount: number; cash_count: number; bank_count: number }>>`
        SELECT
            COALESCE(SUM(amount),0)::float8 AS total_amount,
            COALESCE(SUM(CASE WHEN receipt_number ~ '^C-[0-9]+' THEN amount ELSE 0 END),0)::float8 AS cash_amount,
            COALESCE(SUM(CASE WHEN receipt_number ~ '^B-[0-9]+' THEN amount ELSE 0 END),0)::float8 AS non_cash_amount,
            COALESCE(SUM(CASE WHEN receipt_number ~ '^C-[0-9]+' THEN 1 ELSE 0 END),0)::int AS cash_count,
            COALESCE(SUM(CASE WHEN receipt_number ~ '^B-[0-9]+' THEN 1 ELSE 0 END),0)::int AS bank_count
        FROM fee_transactions
    `;
    const pgTotals = pgTotalsRows?.[0] || { total_amount: 0, cash_amount: 0, non_cash_amount: 0, cash_count: 0, bank_count: 0 };
    const sqliteTotals = sqliteCounts.feeTotals;
    const okTotalAmount = Math.abs(Number(sqliteTotals.total_amount) - Number(pgTotals.total_amount)) < 0.01;
    const okCashCount = Number(sqliteTotals.cash_count) === Number(pgTotals.cash_count);
    const okBankCount = Number(sqliteTotals.bank_count) === Number(pgTotals.bank_count);
    const okCashAmount = Math.abs(Number(sqliteTotals.cash_amount) - Number(pgTotals.cash_amount)) < 0.01;
    const okBankAmount = Math.abs(Number(sqliteTotals.bank_amount) - Number(pgTotals.non_cash_amount)) < 0.01;

    console.log(`${formatResult(okTotalAmount)} fee total sum matches SQLite`);
    console.log(`${formatResult(okCashCount && okBankCount)} cash/bank counts match SQLite`);
    console.log(`${formatResult(okCashAmount && okBankAmount)} cash/bank sums match SQLite`);

    // Teacher assignments parity: count JSON assignments length vs SQLite teacher_assignments
    const teacherAssignmentCountRows = await sql<Array<{ n: number }>>`
        SELECT COALESCE(SUM(jsonb_array_length(assignments)), 0)::int AS n
        FROM staff
        WHERE staff_type = 'teacher'
    `;
    const pgTeacherAssignments = teacherAssignmentCountRows?.[0]?.n || 0;
    const sqliteTeacherAssignments = Number(sqliteCounts.teacherAssignments.n) || 0;
    const okTeacherAssignments = pgTeacherAssignments === sqliteTeacherAssignments;
    console.log(`${formatResult(okTeacherAssignments)} teacher assignments count matches (SQLite=${sqliteTeacherAssignments}, Postgres=${pgTeacherAssignments})`);

    // Integrity: orphan fee transactions
    const orphanTxRows = await sql<Array<{ n: number }>>`
        SELECT COUNT(*)::int AS n
        FROM fee_transactions ft
        LEFT JOIN fee_records fr ON fr.id = ft.fee_record_id
        WHERE fr.id IS NULL
    `;
    const okNoOrphans = (orphanTxRows?.[0]?.n || 0) === 0;
    console.log(`${formatResult(okNoOrphans)} no orphan fee_transactions`);

    // Integrity: duplicate receipts
    const dupReceiptRows = await sql<Array<{ n: number }>>`
        SELECT COUNT(*)::int AS n
        FROM (
            SELECT receipt_number
            FROM fee_transactions
            GROUP BY receipt_number
            HAVING COUNT(*) > 1
        ) d
    `;
    const okReceiptsUnique = (dupReceiptRows?.[0]?.n || 0) === 0;
    console.log(`${formatResult(okReceiptsUnique)} fee_transactions.receipt_number unique`);

    // Integrity: breakdown sums match amount (allow small rounding drift)
    const badBreakdownRows = await sql<Array<{ n: number }>>`
        SELECT COUNT(*)::int AS n
        FROM fee_transactions
        WHERE ABS(
            amount - (breakdown_term1 + breakdown_term2 + breakdown_book_fee)
        ) > 0.01
    `;
    const okBreakdown = (badBreakdownRows?.[0]?.n || 0) === 0;
    console.log(`${formatResult(okBreakdown)} transaction amount matches breakdown totals`);

    // Integrity: fee_term should be populated (Electron may store NULL in SQLite, but runtime expects a usable term)
    const blankFeeTermRows = await sql<Array<{ n: number }>>`
        SELECT COUNT(*)::int AS n
        FROM fee_transactions
        WHERE fee_term IS NULL OR BTRIM(fee_term) = ''
    `;
    const okFeeTermPopulated = (blankFeeTermRows?.[0]?.n || 0) === 0;
    console.log(`${formatResult(okFeeTermPopulated)} fee_term populated on all transactions`);

    // Receipt sequences should be >= max receipt for each prefix
    const [seqRows, maxRows] = await Promise.all([
        sql<Array<{ prefix: string; last_number: number }>>`SELECT prefix, last_number FROM receipt_sequences ORDER BY prefix ASC`,
        sql<Array<{ prefix: string; max_num: number | null }>>`
            SELECT
                SUBSTRING(receipt_number, 1, 1) AS prefix,
                MAX((regexp_match(receipt_number, '(\\d+)$'))[1]::int)::int AS max_num
            FROM fee_transactions
            WHERE receipt_number ~ '^[CB]-[0-9]+$'
            GROUP BY SUBSTRING(receipt_number, 1, 1)
            ORDER BY prefix ASC
        `,
    ]);

    let okReceiptSeq = true;
    const seqMap = new Map(seqRows.map((r) => [r.prefix, r.last_number]));
    for (const r of maxRows) {
        const last = seqMap.get(r.prefix) || 0;
        const max = Number(r.max_num) || 0;
        if (last < max) okReceiptSeq = false;
    }
    console.log(`${formatResult(okReceiptSeq)} receipt_sequences seeded >= max receipts`);

    // Critical failures should exit non-zero
    const criticalOk =
        okFeesCount &&
        okStudentsCount &&
        okNoOrphans &&
        okReceiptsUnique &&
        okBreakdown &&
        okTotalAmount &&
        okCashCount &&
        okBankCount &&
        okCashAmount &&
        okBankAmount &&
        okFeeTermPopulated &&
        okReceiptSeq;
    if (!criticalOk) {
        console.error('\n❌ Verification failed (critical checks).');
        process.exitCode = 1;
        return;
    }
        console.log('\n✅ Verification passed.');
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error('Verification failed:', err);
    process.exitCode = 1;
});
