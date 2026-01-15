/**
 * Migration Script: SQLite (Electron) -> Postgres
 *
 * Usage:
 *   npm run db:setup
 *   npm run migrate:sqlite -- /path/to/school.db
 *
 * Notes:
 * - Designed for migrating into a fresh Postgres database.
 * - If the target DB is not empty, the script will refuse to run unless you pass `--force`.
 * - Preserves Electron parity:
 *   - Receipt numbering normalization (c1/b1 and C-1/B-1)
 *   - Sequential months_paid behavior
 *   - Teacher assignments stored on staff as JSON
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

const MONTHS: string[] = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

function normalizeReceiptNumber(raw: unknown): string | null {
    if (!raw) return null;
    const s = String(raw).trim();
    const m = s.match(/^([cCbB])[- ]?(\d+)$/);
    if (m) return `${m[1].toUpperCase()}-${m[2]}`;
    return s;
}

function normalizeMonthKey(input: unknown): string | null {
    if (!input) return null;
    const s = String(input).trim();
    if (!s) return null;
    const lower = s.toLowerCase();
    const found = MONTHS.find((mn) => lower.includes(mn.toLowerCase()));
    if (found) return found;

    // YYYY-MM
    let m = s.match(/^(\d{4})-(\d{1,2})$/);
    if (m) {
        const idx = Math.max(0, Math.min(11, parseInt(m[2], 10) - 1));
        return MONTHS[idx];
    }
    // MM-YYYY
    m = s.match(/^(\d{1,2})-(\d{4})$/);
    if (m) {
        const idx = Math.max(0, Math.min(11, parseInt(m[1], 10) - 1));
        return MONTHS[idx];
    }

    return s;
}

function yearCodeFromName(name: unknown): string {
    if (!name) return '0000';
    const parts = String(name).match(/\d+/g) || [];
    if (parts.length >= 2) {
        const a = parts[0];
        const b = parts[1];
        const a2 = a.length >= 2 ? a.slice(-2) : a.padStart(2, '0');
        const b2 = b.length >= 2 ? b.slice(-2) : b.padStart(2, '0');
        return `${a2}${b2}`;
    }
    const digits = parts.join('');
    if (digits.length >= 4) return digits.slice(-4);
    return digits.padStart(4, '0');
}

function branchCodeFromName(name: unknown): string {
    const cleaned = String(name || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    const letters = cleaned.map((w) => w[0]).join('').toUpperCase();
    return (letters || 'BR').substring(0, 5);
}

function splitName(name: unknown): { firstName: string; lastName: string } {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    const firstName = parts[0] || 'Unknown';
    const lastName = parts.slice(1).join(' ') || firstName;
    return { firstName, lastName };
}

function toDateOnlyString(value: unknown): string | null {
    if (!value) return null;
    const s = String(value).trim();
    if (!s) return null;
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;

    // Defensive fix for malformed production data like "20225-06-21".
    // Observed pattern in SQLite: year accidentally stored as "2022X" instead of "202X".
    const m5 = s.match(/^(\d{5})-(\d{2})-(\d{2})$/);
    if (m5) {
        const year5 = m5[1];
        if (year5.startsWith('2022')) {
            const fixedYear = `202${year5.slice(-1)}`;
            return `${fixedYear}-${m5[2]}-${m5[3]}`;
        }
        return null;
    }
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
}

function toIsoMidday(value: unknown): string | null {
    const dateOnly = toDateOnlyString(value);
    if (dateOnly) return `${dateOnly}T12:00:00.000Z`;
    if (!value) return null;
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
}

function applyScholarshipToFeeAmounts(
    { term1 = 0, term2 = 0, bookFee = 0 }: { term1: number; term2: number; bookFee: number },
    scholarshipRaw: unknown
) {
    let scholarship = Number(scholarshipRaw) || 0;
    if (scholarship <= 0) return { term1, term2, bookFee };

    const out = { term1: Number(term1) || 0, term2: Number(term2) || 0, bookFee: Number(bookFee) || 0 };
    for (const key of ['term1', 'term2', 'bookFee'] as const) {
        if (scholarship <= 0) break;
        const take = Math.min(out[key], scholarship);
        out[key] = Math.max(0, out[key] - take);
        scholarship -= take;
    }
    return out;
}

type MonthPaymentStatus = { amount: number; paidDate: string; status: 'paid' | 'partial' | 'unpaid' | string };

function updateMonthsPaidSequential(
    monthsPaid: Record<string, MonthPaymentStatus>,
    monthName: string,
    amount: number,
    paidDate: string
): void {
    const idx = MONTHS.indexOf(monthName);
    if (idx === -1) {
        const current = monthsPaid[monthName];
        monthsPaid[monthName] = {
            amount: (Number(current?.amount) || 0) + (Number(amount) || 0),
            paidDate: current?.paidDate || paidDate,
            status: 'paid',
        };
        return;
    }
    for (let i = 0; i <= idx; i++) {
        const key = MONTHS[i];
        const isTarget = i === idx;
        const existing = monthsPaid[key];
        if (!isTarget) {
            if (!existing) monthsPaid[key] = { amount: 0, paidDate, status: 'paid' };
            continue;
        }
        monthsPaid[key] = {
            amount: (Number(existing?.amount) || 0) + (Number(amount) || 0),
            paidDate: existing?.paidDate || paidDate,
            status: 'paid',
        };
    }
}

function feeTermToBreakdown(feeTermRaw: unknown, amount: number) {
    const amt = Number(amount) || 0;
    const feeTerm = String(feeTermRaw || '').toLowerCase();
    if (feeTerm.includes('term2') || feeTerm.includes('term 2')) return { term1: 0, term2: amt, bookFee: 0 };
    if (feeTerm.includes('book')) return { term1: 0, term2: 0, bookFee: amt };
    return { term1: amt, term2: 0, bookFee: 0 };
}

function inferMissingFeeTerm({
    classFees,
    paidSoFar,
}: {
    classFees: { term1: number; term2: number; books: number };
    paidSoFar: { term1: number; term2: number; books: number };
}): 'term1' | 'term2' | 'books' {
    const totals = {
        term1: Number(classFees.term1) || 0,
        term2: Number(classFees.term2) || 0,
        books: Number(classFees.books) || 0,
    };
    const paid = {
        term1: Number(paidSoFar.term1) || 0,
        term2: Number(paidSoFar.term2) || 0,
        books: Number(paidSoFar.books) || 0,
    };

    const pending = {
        term1: Math.max(0, totals.term1 - paid.term1),
        term2: Math.max(0, totals.term2 - paid.term2),
        books: Math.max(0, totals.books - paid.books),
    };

    const priority: Array<'term1' | 'term2' | 'books'> = ['term1', 'term2', 'books'];
    const firstPending = priority.find((k) => pending[k] > 0);
    if (firstPending) return firstPending;

    const firstWithAmount = priority.find((k) => totals[k] > 0);
    return firstWithAmount || 'term1';
}

function recomputeMonthsPaidFromTransactions(
    transactions: Array<{ month_year: string | null; amount: number; date: string }> = []
): Record<string, MonthPaymentStatus> {
    const out: Record<string, MonthPaymentStatus> = {};
    const sorted = [...(transactions || [])].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    for (const tx of sorted) {
        const key = normalizeMonthKey(tx.month_year);
        if (!key) continue;
        const dateOnly = toDateOnlyString(tx.date) || new Date().toISOString().slice(0, 10);
        updateMonthsPaidSequential(out, key, Number(tx.amount) || 0, dateOnly);
    }
    return out;
}

function parseArgs(argv: string[]) {
    const args = { sqlitePath: '', force: false };
    for (const a of argv.slice(2)) {
        if (a === '--force') args.force = true;
        else if (!args.sqlitePath && !a.startsWith('-')) args.sqlitePath = a;
    }
    return args;
}

type SqliteDb = {
    prepare: (sql: string) => { get: (...args: any[]) => any; all: (...args: any[]) => any };
};

function tableExists(sqliteDb: SqliteDb, tableName: string): boolean {
    try {
        const row = sqliteDb.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(tableName) as any;
        return !!row;
    } catch {
        return false;
    }
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

async function assertTargetDbIsEmpty(sql: SqlTag, { force }: { force: boolean }) {
    const [
        branches,
        years,
        feeStructures,
        students,
        enrollments,
        feeRecords,
        txs,
        staff,
        transports,
        uiSettings,
    ] = await Promise.all([
        sql<Array<{ total: number }>>`SELECT COUNT(*)::int AS total FROM branches`,
        sql<Array<{ total: number }>>`SELECT COUNT(*)::int AS total FROM academic_years`,
        sql<Array<{ total: number }>>`SELECT COUNT(*)::int AS total FROM fee_structures`,
        sql<Array<{ total: number }>>`SELECT COUNT(*)::int AS total FROM students`,
        sql<Array<{ total: number }>>`SELECT COUNT(*)::int AS total FROM student_enrollments`,
        sql<Array<{ total: number }>>`SELECT COUNT(*)::int AS total FROM fee_records`,
        sql<Array<{ total: number }>>`SELECT COUNT(*)::int AS total FROM fee_transactions`,
        sql<Array<{ total: number }>>`SELECT COUNT(*)::int AS total FROM staff`,
        sql<Array<{ total: number }>>`SELECT COUNT(*)::int AS total FROM transports`,
        sql<Array<{ total: number }>>`SELECT COUNT(*)::int AS total FROM ui_settings`,
    ]);
    const totals = {
        branches: branches?.[0]?.total || 0,
        academic_years: years?.[0]?.total || 0,
        fee_structures: feeStructures?.[0]?.total || 0,
        students: students?.[0]?.total || 0,
        student_enrollments: enrollments?.[0]?.total || 0,
        fee_records: feeRecords?.[0]?.total || 0,
        fee_transactions: txs?.[0]?.total || 0,
        staff: staff?.[0]?.total || 0,
        transports: transports?.[0]?.total || 0,
        ui_settings: uiSettings?.[0]?.total || 0,
    };
    const any = Object.values(totals).some((n) => n > 0);
    if (!any) return;

    // If only branches/years are present, it's usually because a previous migration
    // attempt failed after those early steps. Since those inserts are idempotent,
    // allow continuing without requiring `--force`.
    const onlyBootstrapData =
        totals.branches > 0 &&
        totals.academic_years > 0 &&
        totals.fee_structures === 0 &&
        totals.students === 0 &&
        totals.student_enrollments === 0 &&
        totals.fee_records === 0 &&
        totals.fee_transactions === 0 &&
        totals.staff === 0 &&
        totals.transports === 0 &&
        totals.ui_settings === 0;
    if (onlyBootstrapData) {
        console.warn('⚠ Target DB already has branches + academic_years (likely from a previous partial migration). Continuing...');
        return;
    }

    // Allow resuming if the DB looks like we got as far as creating core entities
    // but did not yet migrate any fee transactions. This keeps the migration
    // restartable after fixing a mid-run issue without requiring a full DB reset.
    const partialBeforeFees =
        totals.fee_transactions === 0 &&
        totals.fee_structures > 0 &&
        totals.students > 0 &&
        totals.student_enrollments > 0 &&
        totals.fee_records > 0;
    if (partialBeforeFees) {
        console.warn('⚠ Target DB contains migrated core records but no fee transactions yet (partial migration). Continuing...');
        return;
    }
    if (force) {
        console.warn('⚠ Target DB is not empty but --force was provided. Continuing...');
        return;
    }
    console.error('Refusing to migrate into a non-empty DB. Pass --force if you really mean it.');
    console.error('Counts:', totals);
    process.exit(2);
}

async function ensureReceiptSequence(sql: SqlTag, prefix: 'C' | 'B', lastNumber: number) {
    await sql`
        INSERT INTO receipt_sequences (prefix, last_number, updated_at)
        VALUES (${prefix}, ${lastNumber}, NOW())
        ON CONFLICT (prefix)
        DO UPDATE SET last_number = GREATEST(receipt_sequences.last_number, EXCLUDED.last_number), updated_at = NOW()
    `;
}

async function ensureSequence(sql: SqlTag, key: string, value: number) {
    await sql`
        INSERT INTO sequences (key, value, updated_at)
        VALUES (${key}, ${value}, NOW())
        ON CONFLICT (key)
        DO UPDATE SET value = GREATEST(sequences.value, EXCLUDED.value), updated_at = NOW()
    `;
}

async function ensureEnrollment(sql: SqlTag, params: {
    academicYearId: string;
    studentId: string;
    className: string;
    section: string;
    rollNumber: string | null;
    shiftName: string;
    joinDate: string | null;
}) {
    const { academicYearId, studentId, className, section, rollNumber, shiftName, joinDate } = params;
    const rows = await sql<Array<{ id: string }>>`
        WITH ins AS (
            INSERT INTO student_enrollments (
                academic_year_id,
                student_id,
                class,
                section,
                roll_number,
                shift_name,
                status,
                join_date,
                updated_at
            )
            VALUES (
                ${academicYearId}::uuid,
                ${studentId}::uuid,
                ${className},
                ${section},
                ${rollNumber},
                ${shiftName},
                'Active',
                COALESCE(${joinDate}::date, CURRENT_DATE),
                NOW()
            )
            ON CONFLICT (academic_year_id, student_id)
            DO UPDATE SET updated_at = NOW()
            RETURNING id
        )
        SELECT id FROM ins
        UNION ALL
        SELECT id FROM student_enrollments WHERE academic_year_id = ${academicYearId}::uuid AND student_id = ${studentId}::uuid
        LIMIT 1
    `;
    return rows?.[0]?.id as string;
}

async function ensureFeeRecord(sql: SqlTag, params: {
    academicYearId: string;
    studentId: string;
    enrollmentId: string | null;
    branchId: string | null;
    term1Amount: number;
    term2Amount: number;
    bookFeeAmount: number;
}) {
    const { academicYearId, studentId, enrollmentId, branchId, term1Amount, term2Amount, bookFeeAmount } = params;
    const term1Status = term1Amount <= 0 ? 'Paid' : 'Pending';
    const term2Status = term2Amount <= 0 ? 'Paid' : 'Pending';
    const bookStatus = bookFeeAmount <= 0 ? 'Paid' : 'Pending';
    const rows = await sql<Array<{ id: string }>>`
        WITH ins AS (
            INSERT INTO fee_records (
                academic_year_id,
                student_id,
                enrollment_id,
                branch_id,
                term1_amount,
                term1_paid,
                term1_status,
                term2_amount,
                term2_paid,
                term2_status,
                book_fee_amount,
                book_fee_paid,
                book_fee_status,
                months_paid,
                updated_at
            )
            VALUES (
                ${academicYearId}::uuid,
                ${studentId}::uuid,
                ${enrollmentId}::uuid,
                ${branchId}::uuid,
                ${term1Amount},
                0,
                ${term1Status},
                ${term2Amount},
                0,
                ${term2Status},
                ${bookFeeAmount},
                0,
                ${bookStatus},
                '{}'::jsonb,
                NOW()
            )
            ON CONFLICT (academic_year_id, student_id)
            DO UPDATE SET updated_at = NOW()
            RETURNING id
        )
        SELECT id FROM ins
        UNION ALL
        SELECT id FROM fee_records WHERE academic_year_id = ${academicYearId}::uuid AND student_id = ${studentId}::uuid
        LIMIT 1
    `;
    return rows?.[0]?.id as string;
}

async function recomputeFeeRecords(sql: SqlTag) {
    await sql`
        WITH sums AS (
            SELECT
                fee_record_id,
                COALESCE(SUM(breakdown_term1), 0)::numeric AS term1_paid,
                COALESCE(SUM(breakdown_term2), 0)::numeric AS term2_paid,
                COALESCE(SUM(breakdown_book_fee), 0)::numeric AS book_fee_paid
            FROM fee_transactions
            GROUP BY fee_record_id
        )
        UPDATE fee_records fr
        SET
            term1_paid = s.term1_paid,
            term2_paid = s.term2_paid,
            book_fee_paid = s.book_fee_paid,
            updated_at = NOW()
        FROM sums s
        WHERE fr.id = s.fee_record_id
    `;

    await sql`
        UPDATE fee_records
        SET
            term1_status = CASE
                WHEN term1_amount <= 0 THEN 'Paid'
                WHEN term1_paid >= term1_amount THEN 'Paid'
                WHEN term1_paid > 0 THEN 'Partial'
                ELSE 'Pending'
            END,
            term2_status = CASE
                WHEN term2_amount <= 0 THEN 'Paid'
                WHEN term2_paid >= term2_amount THEN 'Paid'
                WHEN term2_paid > 0 THEN 'Partial'
                ELSE 'Pending'
            END,
            book_fee_status = CASE
                WHEN book_fee_amount <= 0 THEN 'Paid'
                WHEN book_fee_paid >= book_fee_amount THEN 'Paid'
                WHEN book_fee_paid > 0 THEN 'Partial'
                ELSE 'Pending'
            END,
            updated_at = NOW()
    `;
}

function parseSqliteMonthsPaid(raw: unknown): Record<string, MonthPaymentStatus> | null {
    if (!raw) return null;
    let parsed: any = null;
    try {
        parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object') return null;

    const out: Record<string, MonthPaymentStatus> = {};
    for (const [month, v] of Object.entries(parsed as Record<string, any>)) {
        const amount = Number(v?.amount) || 0;
        const paidDate = toDateOnlyString(v?.paid_date || v?.paidDate) || null;
        const status = String(v?.status || 'paid');
        if (!paidDate) continue;
        out[String(month)] = { amount, paidDate, status };
    }
    return Object.keys(out).length ? out : null;
}

async function main() {
    const prisma = getPrisma();
    try {
    const { sqlitePath, force } = parseArgs(process.argv);
    if (!sqlitePath) {
        console.error('Usage: npm run migrate:sqlite -- /path/to/school.db [--force]');
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
    await assertSchemaExists(sql);
    await assertTargetDbIsEmpty(sql, { force });

    let SqliteDatabase: any;
    try {
        const mod: any = await import('better-sqlite3');
        SqliteDatabase = mod?.default || mod;
    } catch {
        console.error('better-sqlite3 is required to read the SQLite database for migration.');
        console.error('Install it (include optional deps): npm install --include=optional');
        process.exit(2);
    }

    const sqliteDb = new SqliteDatabase(sqlitePath, { readonly: true, fileMustExist: true }) as SqliteDb;
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║   SQLite → Postgres Migration                              ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`SQLite: ${sqlitePath}`);

    const idMaps = {
        branches: new Map<number, { id: string; code: string; name: string }>(),
        academicYears: new Map<number, { id: string; name: string; isActive: boolean }>(),
        classes: new Map<number, {
            sqliteBranchId: number;
            branchId: string | null;
            name: string;
            shiftName: string;
            startTime: string;
            endTime: string;
            numDivisions: number;
            term1Fee: number;
            term2Fee: number;
            booksFee: number;
            activeFeeStructureId: string | null;
        }>(),
        students: new Map<number, {
            studentId: string;
            academicYearId: string;
            branchId: string | null;
            admissionNumber: string;
            sqliteClassId: number;
            className: string;
            shiftName: string;
            section: string;
            rollNumber: string;
            scholarship: number;
            admissionDate: string | null;
        }>(),
        studentMonthsPaid: new Map<number, Record<string, MonthPaymentStatus>>(),
        feeRecords: new Map<string, string>(), // `${studentId}:${yearId}` -> feeRecordId
    };

    // ---- Branches ----
    console.log('\n🏫 Migrating branches...');
    const branchRows = sqliteDb.prepare('SELECT * FROM branches').all() as Array<{ id: number; name: string }>;
    const usedCodes = new Set<string>();
    for (const row of branchRows) {
        const base = branchCodeFromName(row.name);
        let code = base;
        let suffix = 1;
        while (usedCodes.has(code)) {
            suffix += 1;
            code = `${base}${suffix}`.substring(0, 8);
        }
        usedCodes.add(code);
        const inserted = await sql<Array<{ id: string }>>`
            INSERT INTO branches (name, code, sqlite_id, is_active, updated_at)
            VALUES (${row.name}, ${code}, ${row.id}, true, NOW())
            ON CONFLICT (name)
            DO UPDATE SET code = COALESCE(branches.code, EXCLUDED.code), updated_at = NOW()
            RETURNING id
        `;
        const id = inserted?.[0]?.id;
        idMaps.branches.set(row.id, { id, code, name: row.name });
        console.log(`  ✓ ${row.name} (${code})`);
    }

    // ---- Academic Years ----
    console.log('\n📅 Migrating academic years...');
    const yearRows = sqliteDb.prepare('SELECT * FROM academic_years ORDER BY start_date ASC').all() as Array<{
        id: number;
        name: string;
        start_date: string;
        end_date: string;
        is_active: number;
    }>;
    for (const row of yearRows) {
        const inserted = await sql<Array<{ id: string }>>`
            INSERT INTO academic_years (name, start_date, end_date, is_active, is_locked, sqlite_id, updated_at)
            VALUES (${row.name}, ${toDateOnlyString(row.start_date)}::date, ${toDateOnlyString(row.end_date)}::date, ${!!row.is_active}, false, ${row.id}, NOW())
            ON CONFLICT (name)
            DO UPDATE SET start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, is_active = EXCLUDED.is_active, updated_at = NOW()
            RETURNING id
        `;
        idMaps.academicYears.set(row.id, { id: inserted?.[0]?.id, name: row.name, isActive: !!row.is_active });
        console.log(`  ✓ ${row.name}${row.is_active ? ' (active)' : ''}`);
    }

    const activeYear = [...idMaps.academicYears.values()].find((y) => y.isActive) || [...idMaps.academicYears.values()][0];
    if (!activeYear) {
        console.error('No academic years found in SQLite. Cannot migrate.');
        process.exit(2);
    }

    // ---- Classes (Fee Structures) ----
    console.log('\n🏷️  Migrating classes → fee structures...');
    const classRows = sqliteDb.prepare('SELECT * FROM classes ORDER BY id ASC').all() as Array<any>;
    for (const row of classRows) {
        let feesObj: any = null;
        if (row.fees) {
            try {
                feesObj = typeof row.fees === 'string' ? JSON.parse(row.fees) : row.fees;
            } catch {
                feesObj = null;
            }
        }

        const term1Fee = Number(feesObj?.term1 ?? row.term1_fee) || 0;
        const term2Fee = Number(feesObj?.term2 ?? row.term2_fee) || 0;
        const booksFee = Number(feesObj?.books ?? feesObj?.bookFee ?? row.books_charge) || 0;

        const branchInfo = idMaps.branches.get(row.branch_id);
        idMaps.classes.set(row.id, {
            sqliteBranchId: row.branch_id,
            branchId: branchInfo?.id || null,
            name: String(row.name || '').trim(),
            shiftName: String(row.shift_name || '').trim(),
            startTime: String(row.start_time || '').trim(),
            endTime: String(row.end_time || '').trim(),
            numDivisions: Number(row.num_divisions) || 1,
            term1Fee,
            term2Fee,
            booksFee,
            activeFeeStructureId: null,
        });
    }

    for (const year of idMaps.academicYears.values()) {
        for (const [sqliteClassId, c] of idMaps.classes) {
            const res = await sql<Array<{ id: string }>>`
                INSERT INTO fee_structures (
                    academic_year_id,
                    branch_id,
                    class,
                    shift_name,
                    start_time,
                    end_time,
                    num_divisions,
                    term1_fee,
                    term2_fee,
                    book_fee,
                    sqlite_id,
                    updated_at
                )
                VALUES (
                    ${year.id}::uuid,
                    ${c.branchId}::uuid,
                    ${c.name},
                    ${c.shiftName},
                    ${c.startTime},
                    ${c.endTime},
                    ${c.numDivisions},
                    ${c.term1Fee},
                    ${c.term2Fee},
                    ${c.booksFee},
                    ${sqliteClassId},
                    NOW()
                )
                ON CONFLICT (academic_year_id, branch_id, class, shift_name)
                DO UPDATE SET
                    start_time = EXCLUDED.start_time,
                    end_time = EXCLUDED.end_time,
                    num_divisions = EXCLUDED.num_divisions,
                    term1_fee = EXCLUDED.term1_fee,
                    term2_fee = EXCLUDED.term2_fee,
                    book_fee = EXCLUDED.book_fee,
                    sqlite_id = EXCLUDED.sqlite_id,
                    updated_at = NOW()
                RETURNING id
            `;

            if (year.id === activeYear.id) {
                const current = idMaps.classes.get(sqliteClassId);
                if (current) current.activeFeeStructureId = res?.[0]?.id || null;
            }
        }
    }
    console.log(`  ✓ Created fee structures for ${idMaps.classes.size} class(es) across ${idMaps.academicYears.size} year(s)`);

    // ---- Students (and enrollments + fee records) ----
    console.log('\n👨‍🎓 Migrating students...');
    const studentRows = sqliteDb.prepare('SELECT * FROM students ORDER BY id ASC').all() as Array<any>;
    const seqMaxByBranchYear = new Map<string, number>(); // key student:${branchId}:${yearId}

    for (const row of studentRows) {
        const classInfo = idMaps.classes.get(row.class_id);
        const branchInfo = classInfo ? idMaps.branches.get(classInfo.sqliteBranchId) : undefined;
        const branchId = branchInfo?.id || null;
        const yearInfo = idMaps.academicYears.get(row.academic_year_id) || activeYear;

        const { firstName, lastName } = splitName(row.name);
        const branchCode = (branchInfo?.code || 'UNK').trim() || 'UNK';
        const yearCode = yearCodeFromName(yearInfo?.name || '');
        const studentIdPadded = String(row.id).padStart(5, '0');
        const admissionNumber = `${branchCode}-${yearCode}-${studentIdPadded}`.toUpperCase();

        const admissionDate = toDateOnlyString(row.admission_date) || toDateOnlyString(row.created_at);
        const gender =
            row.gender === 'M' || row.gender === 'Male' ? 'Male' :
            row.gender === 'F' || row.gender === 'Female' ? 'Female' : 'Other';

        const inserted = await sql<Array<{ id: string }>>`
            INSERT INTO students (
                admission_number,
                first_name,
                last_name,
                admission_date,
                gender,
                birth_place,
                religion,
                address,
                father_name,
                mother_name,
                parent_contact1,
                parent_contact2,
                branch_id,
                fee_scholarship,
                is_active,
                joined_at,
                sqlite_id,
                sqlite_class_id,
                sqlite_academic_year_id,
                updated_at
            )
            VALUES (
                ${admissionNumber},
                ${firstName},
                ${lastName || firstName},
                COALESCE(${admissionDate}::date, CURRENT_DATE),
                ${gender},
                ${row.birth_place || null},
                ${row.religion || null},
                ${row.address || null},
                ${row.father_name || null},
                ${row.mother_name || null},
                ${row.parents_contact1 || null},
                ${row.parents_contact2 || null},
                ${branchId}::uuid,
                ${Number(row.fee_scholarship) || 0},
                true,
                COALESCE(${admissionDate}::date, CURRENT_DATE),
                ${row.id},
                ${row.class_id},
                ${row.academic_year_id || null},
                NOW()
            )
            ON CONFLICT (admission_number)
            DO UPDATE SET updated_at = NOW()
            RETURNING id
        `;
        const studentId = inserted?.[0]?.id;

        const monthsPaid = parseSqliteMonthsPaid(row.months_paid);
        if (monthsPaid) idMaps.studentMonthsPaid.set(row.id, monthsPaid);

        const className = classInfo?.name || 'Unknown';
        const shiftName = classInfo?.shiftName || '';
        const section = row.division || 'A';
        const rollNumber = row.roll_number || '';
        const scholarship = Number(row.fee_scholarship) || 0;

        idMaps.students.set(row.id, {
            studentId,
            academicYearId: yearInfo.id,
            branchId,
            admissionNumber,
            sqliteClassId: row.class_id,
            className,
            shiftName,
            section,
            rollNumber,
            scholarship,
            admissionDate,
        });

        // Seed sequences table so future admission numbers don't collide.
        const seqKey = `student:${String(branchId || 'none')}:${String(yearInfo.id || 'none')}`;
        const currentMax = seqMaxByBranchYear.get(seqKey) || 0;
        seqMaxByBranchYear.set(seqKey, Math.max(currentMax, Number(row.id) || 0));

        // Enrollment + fee record for this student's year
        const enrollmentId = await ensureEnrollment(sql, {
            academicYearId: yearInfo.id,
            studentId,
            className,
            section,
            rollNumber: rollNumber || null,
            shiftName,
            joinDate: admissionDate,
        });

        const adjusted = applyScholarshipToFeeAmounts(
            { term1: classInfo?.term1Fee || 0, term2: classInfo?.term2Fee || 0, bookFee: classInfo?.booksFee || 0 },
            scholarship
        );

        const feeRecordId = await ensureFeeRecord(sql, {
            academicYearId: yearInfo.id,
            studentId,
            enrollmentId,
            branchId,
            term1Amount: adjusted.term1,
            term2Amount: adjusted.term2,
            bookFeeAmount: adjusted.bookFee,
        });
        idMaps.feeRecords.set(`${studentId}:${yearInfo.id}`, feeRecordId);
    }
    console.log(`  ✓ Migrated ${idMaps.students.size} student(s)`);

    // Apply admission-number sequences
    for (const [key, value] of seqMaxByBranchYear.entries()) {
        await ensureSequence(sql, key, value);
    }

    // ---- Staff ----
    console.log('\n👩‍🏫 Migrating staff + teacher assignments...');
    const staffRows = sqliteDb.prepare('SELECT * FROM staff ORDER BY id ASC').all() as Array<any>;
    const assignmentRows = sqliteDb.prepare('SELECT * FROM teacher_assignments ORDER BY id ASC').all() as Array<any>;

    const assignmentsByStaff = new Map<number, any[]>();
    for (const row of assignmentRows) {
        if (!assignmentsByStaff.has(row.staff_id)) assignmentsByStaff.set(row.staff_id, []);
        const classInfo = idMaps.classes.get(row.class_id);
        assignmentsByStaff.get(row.staff_id)!.push({
            classEntryId: classInfo?.activeFeeStructureId || null,
            branchId: classInfo?.branchId || null,
            className: classInfo?.name || 'Unknown',
            shiftName: classInfo?.shiftName || '',
            division: row.division || '',
        });
    }

    for (const row of staffRows) {
        const assignments = assignmentsByStaff.get(row.id) || [];
        let inferredBranchId: string | null = null;
        if (row.staff_type === 'teacher' && assignments.length) {
            const unique = new Set(assignments.map((a) => a.branchId).filter(Boolean));
            if (unique.size === 1) inferredBranchId = [...unique][0];
        }

        await sql`
            INSERT INTO staff (
                name,
                contact,
                email,
                staff_type,
                role,
                branch_id,
                assignments,
                is_active,
                sqlite_id,
                updated_at
            )
            VALUES (
                ${row.name},
                ${row.contact || null},
                NULL,
                ${row.staff_type},
                ${row.role || null},
                ${inferredBranchId}::uuid,
                ${JSON.stringify(assignments)}::jsonb,
                true,
                ${row.id},
                NOW()
            )
            ON CONFLICT (sqlite_id) WHERE sqlite_id IS NOT NULL
            DO UPDATE SET
                name = EXCLUDED.name,
                contact = EXCLUDED.contact,
                staff_type = EXCLUDED.staff_type,
                role = EXCLUDED.role,
                branch_id = EXCLUDED.branch_id,
                assignments = EXCLUDED.assignments,
                is_active = EXCLUDED.is_active,
                updated_at = NOW()
        `;
    }
    console.log(`  ✓ Migrated ${staffRows.length} staff member(s)`);

    // ---- Transports ----
    console.log('\n🚌 Migrating transports...');
    const transportTable = tableExists(sqliteDb, 'transports') ? 'transports' : (tableExists(sqliteDb, 'transport') ? 'transport' : null);
    if (!transportTable) {
        console.log('  ⚠ No transport(s) table found in SQLite, skipping');
    } else {
        const transportRows = sqliteDb.prepare(`SELECT * FROM ${transportTable} ORDER BY id ASC`).all() as Array<any>;
        for (const row of transportRows) {
            const vehicleNumber = String(row.driver_car_number || '').toUpperCase();
            await sql`
                INSERT INTO transports (
                    driver_name,
                    driver_contact,
                    route,
                    vehicle_type,
                    vehicle_number,
                    capacity,
                    branch_id,
                    is_active,
                    sqlite_id,
                    updated_at
                )
                VALUES (
                    ${row.driver_name},
                    ${row.driver_contact},
                    ${row.driver_route},
                    ${row.driver_car || ''},
                    ${vehicleNumber},
                    NULL,
                    NULL,
                    true,
                    ${row.id},
                    NOW()
                )
                ON CONFLICT (sqlite_id) WHERE sqlite_id IS NOT NULL
                DO UPDATE SET
                    driver_name = EXCLUDED.driver_name,
                    driver_contact = EXCLUDED.driver_contact,
                    route = EXCLUDED.route,
                    vehicle_type = EXCLUDED.vehicle_type,
                    vehicle_number = EXCLUDED.vehicle_number,
                    is_active = EXCLUDED.is_active,
                    updated_at = NOW()
            `;
        }
        console.log(`  ✓ Migrated ${transportRows.length} transport(s)`);
    }

    // ---- UI settings ----
    console.log('\n⚙️  Migrating settings...');
    const settingsRows = sqliteDb.prepare('SELECT * FROM settings ORDER BY id ASC').all() as Array<any>;
    for (const row of settingsRows) {
        let parsed: any = null;
        try {
            parsed = row.value ? JSON.parse(row.value) : null;
        } catch {
            parsed = row.value ? String(row.value) : null;
        }
        await sql`
            INSERT INTO ui_settings (key, value, category, updated_at)
            VALUES (${row.key}, ${parsed ? JSON.stringify(parsed) : null}::jsonb, ${row.category || 'general'}, NOW())
            ON CONFLICT (key)
            DO UPDATE SET value = EXCLUDED.value, category = EXCLUDED.category, updated_at = NOW()
        `;
    }

    // ---- Fees (transactions) ----
    console.log('\n💰 Migrating fee payments...');
    const feeRows = sqliteDb.prepare('SELECT * FROM fees ORDER BY payment_date ASC, created_at ASC, id ASC').all() as Array<any>;
    const seenNormalizedReceipts = new Map<string, string>();
    const maxByPrefix: Record<'C' | 'B', number> = { C: 0, B: 0 };
    const paidByStudentYear = new Map<string, { term1: number; term2: number; books: number }>();

    let migratedFees = 0;
    let skippedFees = 0;
    for (const row of feeRows) {
        const studentInfo = idMaps.students.get(row.student_id);
        if (!studentInfo) {
            skippedFees++;
            continue;
        }

        const yearInfo = row.academic_year_id ? idMaps.academicYears.get(row.academic_year_id) : null;
        const academicYearId = yearInfo?.id || studentInfo.academicYearId;
        const branchInfo = row.branch_id ? idMaps.branches.get(row.branch_id) : null;
        const branchId = branchInfo?.id || studentInfo.branchId;

        const studentId = studentInfo.studentId;
        const recordKey = `${studentId}:${academicYearId}`;
        let feeRecordId = idMaps.feeRecords.get(recordKey);
        if (!feeRecordId) {
            // Fees for a different academic year than the student record: create year enrollment + fee_record.
            const classInfo = idMaps.classes.get(studentInfo.sqliteClassId);
            const adjusted = applyScholarshipToFeeAmounts(
                { term1: classInfo?.term1Fee || 0, term2: classInfo?.term2Fee || 0, bookFee: classInfo?.booksFee || 0 },
                studentInfo.scholarship
            );
            const enrollmentId = await ensureEnrollment(sql, {
                academicYearId,
                studentId,
                className: studentInfo.className,
                section: studentInfo.section,
                rollNumber: studentInfo.rollNumber || null,
                shiftName: studentInfo.shiftName,
                joinDate: studentInfo.admissionDate,
            });
            feeRecordId = await ensureFeeRecord(sql, {
                academicYearId,
                studentId,
                enrollmentId,
                branchId,
                term1Amount: adjusted.term1,
                term2Amount: adjusted.term2,
                bookFeeAmount: adjusted.bookFee,
            });
            idMaps.feeRecords.set(recordKey, feeRecordId);
        }

        const rawReceipt = row.receipt_number;
        const normalizedReceipt = normalizeReceiptNumber(rawReceipt);
        if (normalizedReceipt) {
            const prevRaw = seenNormalizedReceipts.get(normalizedReceipt);
            if (prevRaw && prevRaw !== rawReceipt) {
                throw new Error(
                    `Receipt normalization collision: "${rawReceipt}" and "${prevRaw}" both normalize to "${normalizedReceipt}". ` +
                    'Fix the duplicate/case-variant receipts in SQLite before migrating.'
                );
            }
            seenNormalizedReceipts.set(normalizedReceipt, rawReceipt);
        }

        const match = normalizedReceipt ? normalizedReceipt.match(/^([CB])-(\d+)$/) : null;
        if (match) {
            const prefix = match[1] as 'C' | 'B';
            const n = parseInt(match[2], 10);
            if (Number.isFinite(n)) maxByPrefix[prefix] = Math.max(maxByPrefix[prefix] || 0, n);
        }

        const amount = Number(row.amount) || 0;

        const feeTermRaw = String(row.fee_term || '').trim();
        const studentYearKey = `${studentId}:${academicYearId}`;
        const paidSoFar = paidByStudentYear.get(studentYearKey) || { term1: 0, term2: 0, books: 0 };

        const classInfo = idMaps.classes.get(studentInfo.sqliteClassId);
        const classFees = {
            term1: Number(classInfo?.term1Fee) || 0,
            term2: Number(classInfo?.term2Fee) || 0,
            books: Number(classInfo?.booksFee) || 0,
        };

        const inferredFeeTerm = feeTermRaw
            ? feeTermRaw
            : inferMissingFeeTerm({ classFees, paidSoFar });

        const breakdown = feeTermToBreakdown(inferredFeeTerm, amount);
        const paymentMode =
            row.payment_type === 'cash' ? 'Cash' :
            (row.cheque_number || row.cheque_date) ? 'Cheque' : 'Bank Transfer';

        const txDate = toIsoMidday(row.payment_date) || toIsoMidday(row.created_at) || new Date().toISOString();
        const chequeDate = toDateOnlyString(row.cheque_date);

        await sql`
            INSERT INTO fee_transactions (
                fee_record_id,
                receipt_number,
                date,
                amount,
                payment_mode,
                cheque_number,
                cheque_date,
                bank_name,
                payee_name,
                upi_id,
                upi_reference,
                reference,
                remarks,
                breakdown_term1,
                breakdown_term2,
                breakdown_book_fee,
                month_year,
                fee_term,
                sqlite_id
            )
            VALUES (
                ${feeRecordId}::uuid,
                ${normalizedReceipt || String(rawReceipt)},
                ${txDate}::timestamptz,
                ${amount},
                ${paymentMode},
                ${row.cheque_number || null},
                ${chequeDate || null}::date,
                ${row.bank_name || null},
                ${row.payee_name || null},
                NULL,
                NULL,
                NULL,
                ${row.notes || null},
                ${breakdown.term1},
                ${breakdown.term2},
                ${breakdown.bookFee},
                ${row.month_year || null},
                ${inferredFeeTerm || ''},
                ${row.id}
            )
            ON CONFLICT (receipt_number)
            DO UPDATE SET
                fee_record_id = EXCLUDED.fee_record_id,
                date = EXCLUDED.date,
                amount = EXCLUDED.amount,
                payment_mode = EXCLUDED.payment_mode,
                cheque_number = EXCLUDED.cheque_number,
                cheque_date = EXCLUDED.cheque_date,
                bank_name = EXCLUDED.bank_name,
                payee_name = EXCLUDED.payee_name,
                upi_id = EXCLUDED.upi_id,
                upi_reference = EXCLUDED.upi_reference,
                reference = EXCLUDED.reference,
                remarks = EXCLUDED.remarks,
                breakdown_term1 = EXCLUDED.breakdown_term1,
                breakdown_term2 = EXCLUDED.breakdown_term2,
                breakdown_book_fee = EXCLUDED.breakdown_book_fee,
                month_year = EXCLUDED.month_year,
                fee_term = EXCLUDED.fee_term,
                sqlite_id = EXCLUDED.sqlite_id
        `;

        // Update running paid-by-term totals (used only for inferring missing fee_term).
        paidSoFar.term1 += Number(breakdown.term1) || 0;
        paidSoFar.term2 += Number(breakdown.term2) || 0;
        paidSoFar.books += Number(breakdown.bookFee) || 0;
        paidByStudentYear.set(studentYearKey, paidSoFar);
        migratedFees++;
        if (migratedFees % 100 === 0) console.log(`  ... ${migratedFees} fee payments processed`);
    }
    console.log(`  ✓ Migrated ${migratedFees} fee payment(s) (${skippedFees} skipped due to missing students)`);

    // Recompute fee record paid/status fields from transactions
    await recomputeFeeRecords(sql);

    // months_paid: recompute sequential status from Postgres transactions (idempotent), then override with SQLite months_paid where present
    console.log('\n🗓️  Applying months_paid...');
    const recordIds = await sql<Array<{ id: string }>>`SELECT id FROM fee_records`;
    for (const r of recordIds) {
        const txs = await sql<Array<{ month_year: string | null; amount: string; date: string }>>`
            SELECT month_year, amount::text, date::text
            FROM fee_transactions
            WHERE fee_record_id = ${r.id}::uuid
            ORDER BY date ASC, created_at ASC
        `;
        const monthsPaid = recomputeMonthsPaidFromTransactions(
            txs.map((t) => ({ month_year: t.month_year, amount: Number(t.amount) || 0, date: t.date }))
        );
        await sql`UPDATE fee_records SET months_paid = ${JSON.stringify(monthsPaid)}::jsonb, updated_at = NOW() WHERE id = ${r.id}::uuid`;
    }

    let applied = 0;
    for (const [sqliteStudentId, monthsPaid] of idMaps.studentMonthsPaid.entries()) {
        const s = idMaps.students.get(sqliteStudentId);
        if (!s) continue;
        const feeRecordId = idMaps.feeRecords.get(`${s.studentId}:${s.academicYearId}`);
        if (!feeRecordId) continue;
        await sql`UPDATE fee_records SET months_paid = ${JSON.stringify(monthsPaid)}::jsonb, updated_at = NOW() WHERE id = ${feeRecordId}::uuid`;
        applied++;
    }
    console.log(`  ✓ months_paid updated (${applied} from SQLite overrides)`);

    // Receipt sequences for production runtime
    await ensureReceiptSequence(sql, 'C', maxByPrefix.C || 0);
    await ensureReceiptSequence(sql, 'B', maxByPrefix.B || 0);
    console.log(`\n🧾 Receipt sequences seeded: C=${maxByPrefix.C || 0}, B=${maxByPrefix.B || 0}`);

    console.log('\n✅ Migration complete.');
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error('Migration failed:', err);
    process.exitCode = 1;
});
