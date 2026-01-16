/**
 * Postgres schema bootstrap for the Admin Portal.
 *
 * Usage:
 *   tsx scripts/setup-postgres-schema.ts
 *
 * This creates tables + indexes if they don't exist yet.
 * Safe to run multiple times.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { loadEnvFiles } from './load-env';
import { getPrisma } from '../lib/prisma';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnvFiles({ rootDir: path.join(__dirname, '..') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('DATABASE_URL is required (set in .env/.env.local)');
    process.exit(2);
}

function redactDbUrl(url: string) {
    return String(url).replace(/\/\/([^:]+):([^@]+)@/g, '//***:***@');
}

async function main() {
    const prisma = getPrisma();
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║   Postgres Schema Setup                                   ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`Postgres: ${redactDbUrl(DATABASE_URL)}`);

    const statements: string[] = [
        `CREATE EXTENSION IF NOT EXISTS pgcrypto`,

        `CREATE TABLE IF NOT EXISTS branches (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            name text NOT NULL UNIQUE,
            code text UNIQUE,
            address text,
            contact text,
            email text,
            is_active boolean NOT NULL DEFAULT true,
            sqlite_id integer,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )`,

        `CREATE TABLE IF NOT EXISTS academic_years (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            name text NOT NULL UNIQUE,
            start_date date NOT NULL,
            end_date date NOT NULL,
            is_active boolean NOT NULL DEFAULT false,
            is_locked boolean NOT NULL DEFAULT false,
            sqlite_id integer,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )`,

        `CREATE TABLE IF NOT EXISTS users (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            username text NOT NULL UNIQUE,
            password text NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )`,

        `CREATE TABLE IF NOT EXISTS settings (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            singleton boolean NOT NULL DEFAULT true UNIQUE,
            school_name text NOT NULL DEFAULT 'School',
            school_tagline text NOT NULL DEFAULT 'Where Learning Meets Excellence',
            address text NOT NULL DEFAULT '',
            phone text NOT NULL DEFAULT '',
            phone2 text NOT NULL DEFAULT '',
            phone3 text NOT NULL DEFAULT '',
            email text NOT NULL DEFAULT '',
            logo_url text NOT NULL DEFAULT '',
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )`,

        `CREATE TABLE IF NOT EXISTS ui_settings (
            key text PRIMARY KEY,
            value jsonb,
            category text NOT NULL DEFAULT 'general',
            updated_at timestamptz NOT NULL DEFAULT now()
        )`,
        // Migrate legacy UI settings models where a division column was stored as `section`.
        `UPDATE ui_settings
         SET value = jsonb_set(
             value,
             '{columnVisibilityModel}',
             (value->'columnVisibilityModel') - 'section' || jsonb_build_object('division', value->'columnVisibilityModel'->'section'),
             true
         )
         WHERE value ? 'columnVisibilityModel'
           AND jsonb_typeof(value->'columnVisibilityModel') = 'object'
           AND (value->'columnVisibilityModel') ? 'section'
           AND NOT (value->'columnVisibilityModel') ? 'division'`,

        `CREATE TABLE IF NOT EXISTS students (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            admission_number text NOT NULL UNIQUE,
            first_name text NOT NULL,
            last_name text NOT NULL,
            dob date,
            admission_date date NOT NULL DEFAULT CURRENT_DATE,
            gender text NOT NULL,
            birth_place text,
            religion text,
            address text,
            father_name text,
            mother_name text,
            parent_contact1 text,
            parent_contact2 text,
            branch_id uuid REFERENCES branches(id),
            fee_scholarship numeric NOT NULL DEFAULT 0,
            is_active boolean NOT NULL DEFAULT true,
            joined_at date NOT NULL DEFAULT CURRENT_DATE,
            sqlite_id integer,
            sqlite_class_id integer,
            sqlite_academic_year_id integer,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )`,
        `CREATE INDEX IF NOT EXISTS students_branch_active_idx ON students(branch_id, is_active)`,
        `CREATE INDEX IF NOT EXISTS students_name_idx ON students(lower(first_name), lower(last_name))`,
        `CREATE UNIQUE INDEX IF NOT EXISTS students_sqlite_id_uniq ON students(sqlite_id) WHERE sqlite_id IS NOT NULL`,

        `CREATE TABLE IF NOT EXISTS fee_structures (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            academic_year_id uuid NOT NULL REFERENCES academic_years(id),
            branch_id uuid REFERENCES branches(id),
            class text NOT NULL,
            shift_name text NOT NULL DEFAULT '',
            start_time text NOT NULL DEFAULT '',
            end_time text NOT NULL DEFAULT '',
            num_divisions integer NOT NULL DEFAULT 1,
            term1_fee numeric NOT NULL DEFAULT 0,
            term2_fee numeric NOT NULL DEFAULT 0,
            book_fee numeric NOT NULL DEFAULT 0,
            sqlite_id integer,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            UNIQUE (academic_year_id, branch_id, class, shift_name)
        )`,
        `CREATE INDEX IF NOT EXISTS fee_structures_lookup_idx ON fee_structures(academic_year_id, branch_id, class, shift_name)`,

        `CREATE TABLE IF NOT EXISTS student_enrollments (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            academic_year_id uuid NOT NULL REFERENCES academic_years(id),
            student_id uuid NOT NULL REFERENCES students(id),
            class text NOT NULL,
            division text NOT NULL,
            roll_number text,
            shift_name text NOT NULL DEFAULT '',
            status text NOT NULL DEFAULT 'Active',
            join_date date NOT NULL DEFAULT CURRENT_DATE,
            leave_date date,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            UNIQUE (academic_year_id, student_id)
        )`,
        // Backward-compatible rename: older DBs had `section` instead of `division`.
        `DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'student_enrollments'
                  AND column_name = 'section'
            ) AND NOT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'student_enrollments'
                  AND column_name = 'division'
            ) THEN
                ALTER TABLE student_enrollments RENAME COLUMN section TO division;
            END IF;
        END $$;`,
        `CREATE INDEX IF NOT EXISTS enrollments_year_class_idx ON student_enrollments(academic_year_id, class)`,

        `CREATE TABLE IF NOT EXISTS fee_records (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            academic_year_id uuid NOT NULL REFERENCES academic_years(id),
            student_id uuid NOT NULL REFERENCES students(id),
            enrollment_id uuid REFERENCES student_enrollments(id),
            branch_id uuid REFERENCES branches(id),
            term1_amount numeric NOT NULL DEFAULT 0,
            term1_paid numeric NOT NULL DEFAULT 0,
            term1_status text NOT NULL DEFAULT 'Pending',
            term2_amount numeric NOT NULL DEFAULT 0,
            term2_paid numeric NOT NULL DEFAULT 0,
            term2_status text NOT NULL DEFAULT 'Pending',
            book_fee_amount numeric NOT NULL DEFAULT 0,
            book_fee_paid numeric NOT NULL DEFAULT 0,
            book_fee_status text NOT NULL DEFAULT 'Pending',
            months_paid jsonb NOT NULL DEFAULT '{}'::jsonb,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            UNIQUE (academic_year_id, student_id)
        )`,
        `CREATE INDEX IF NOT EXISTS fee_records_year_branch_idx ON fee_records(academic_year_id, branch_id)`,

        `CREATE TABLE IF NOT EXISTS fee_transactions (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            fee_record_id uuid NOT NULL REFERENCES fee_records(id) ON DELETE CASCADE,
            receipt_number text NOT NULL UNIQUE,
            date timestamptz NOT NULL DEFAULT now(),
            amount numeric NOT NULL DEFAULT 0,
            payment_mode text NOT NULL,
            cheque_number text,
            cheque_date date,
            bank_name text,
            payee_name text,
            upi_id text,
            upi_reference text,
            reference text,
            remarks text,
            breakdown_term1 numeric NOT NULL DEFAULT 0,
            breakdown_term2 numeric NOT NULL DEFAULT 0,
            breakdown_book_fee numeric NOT NULL DEFAULT 0,
            month_year text,
            fee_term text NOT NULL DEFAULT '',
            sqlite_id integer,
            created_at timestamptz NOT NULL DEFAULT now()
        )`,
        `CREATE INDEX IF NOT EXISTS fee_tx_record_idx ON fee_transactions(fee_record_id, date DESC)`,
        `CREATE INDEX IF NOT EXISTS fee_tx_date_idx ON fee_transactions(date DESC)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS fee_tx_sqlite_id_uniq ON fee_transactions(sqlite_id) WHERE sqlite_id IS NOT NULL`,
        // Normalize legacy fee_term values to canonical keys (term1|term2|books).
        `UPDATE fee_transactions
         SET fee_term = CASE
             WHEN lower(fee_term) LIKE '%term2%' OR lower(fee_term) LIKE '%term 2%' THEN 'term2'
             WHEN lower(fee_term) LIKE '%book%' THEN 'books'
             WHEN lower(fee_term) LIKE '%term1%' OR lower(fee_term) LIKE '%term 1%' THEN 'term1'
             ELSE 'term1'
         END
         WHERE fee_term IS NOT NULL
           AND fee_term <> ''
           AND fee_term NOT IN ('term1', 'term2', 'books')`,
        // Normalize common legacy payment_mode variants to canonical values.
        `UPDATE fee_transactions
         SET payment_mode = CASE
             WHEN lower(payment_mode) LIKE '%cash%' THEN 'Cash'
             WHEN lower(payment_mode) LIKE '%upi%' THEN 'UPI'
             WHEN lower(payment_mode) LIKE '%cheque%' OR lower(payment_mode) LIKE '%check%' THEN 'Cheque'
             WHEN lower(payment_mode) LIKE '%bank%' OR lower(payment_mode) LIKE '%transfer%' THEN 'Bank Transfer'
             ELSE payment_mode
         END
         WHERE payment_mode IS NOT NULL
           AND payment_mode <> ''
           AND payment_mode NOT IN ('Cash', 'UPI', 'Cheque', 'Bank Transfer')`,

        `CREATE TABLE IF NOT EXISTS receipt_sequences (
            prefix text PRIMARY KEY,
            last_number integer NOT NULL DEFAULT 0,
            updated_at timestamptz NOT NULL DEFAULT now()
        )`,

        `CREATE TABLE IF NOT EXISTS sequences (
            key text PRIMARY KEY,
            value integer NOT NULL DEFAULT 0,
            updated_at timestamptz NOT NULL DEFAULT now()
        )`,

        `CREATE TABLE IF NOT EXISTS staff (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            name text NOT NULL,
            contact text,
            email text,
            staff_type text NOT NULL CHECK (staff_type IN ('office', 'teacher')),
            role text,
            branch_id uuid REFERENCES branches(id),
            assignments jsonb NOT NULL DEFAULT '[]'::jsonb,
            is_active boolean NOT NULL DEFAULT true,
            sqlite_id integer,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )`,
        `CREATE INDEX IF NOT EXISTS staff_branch_type_idx ON staff(branch_id, staff_type)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS staff_sqlite_id_uniq ON staff(sqlite_id) WHERE sqlite_id IS NOT NULL`,

        `CREATE TABLE IF NOT EXISTS transports (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            driver_name text NOT NULL,
            driver_contact text NOT NULL,
            route text NOT NULL,
            vehicle_type text NOT NULL DEFAULT '',
            vehicle_number text NOT NULL UNIQUE,
            capacity integer,
            branch_id uuid REFERENCES branches(id),
            is_active boolean NOT NULL DEFAULT true,
            sqlite_id integer,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS transports_sqlite_id_uniq ON transports(sqlite_id) WHERE sqlite_id IS NOT NULL`,

        `CREATE TABLE IF NOT EXISTS audit_logs (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            action text NOT NULL,
            entity text NOT NULL,
            entity_id text,
            entity_name text,
            changes jsonb NOT NULL DEFAULT '{}'::jsonb,
            performed_by text NOT NULL DEFAULT 'system',
            ip_address text,
            user_agent text,
            timestamp timestamptz NOT NULL DEFAULT now(),
            created_at timestamptz NOT NULL DEFAULT now()
        )`,
        `CREATE INDEX IF NOT EXISTS audit_logs_ts_idx ON audit_logs(timestamp DESC)`,
        // Migrate legacy audit change keys (top-level): `section` -> `division`.
        `UPDATE audit_logs
         SET changes = (changes - 'section') || jsonb_build_object('division', changes->'section')
         WHERE jsonb_typeof(changes) = 'object'
           AND changes ? 'section'
           AND NOT changes ? 'division'`,
    ];

    for (const stmt of statements) {
        await prisma.$executeRawUnsafe(stmt);
    }

    console.log('✓ Schema ensured');
    await prisma.$disconnect();
}

main().catch((err) => {
    console.error('Schema setup failed:', err);
    process.exitCode = 1;
});
