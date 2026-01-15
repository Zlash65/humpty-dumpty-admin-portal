'use server';

import dbConnect from '@/lib/db';
import { dateToISOString } from '@/lib/serialize';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/sql';

// Domain types (kept aligned with existing UI expectations)
export type FeeStatus = 'Pending' | 'Partial' | 'Paid';
export type PaymentMode = 'Cash' | 'Bank Transfer' | 'Cheque' | 'UPI';
export type MonthPaymentStatusType = 'paid' | 'partial' | 'unpaid';

// Types
interface ActionResult {
    success?: boolean;
    error?: string;
    receiptNumber?: string;
}

interface FeeAmounts {
    term1: number;
    term2: number;
    bookFee: number;
}

interface FeeHead {
    amount: number;
    paid: number;
    status: FeeStatus;
}

interface FeeHeads {
    term1: FeeHead;
    term2: FeeHead;
    bookFee: FeeHead;
}

type FeeHeadKey = 'term1' | 'term2' | 'bookFee';

interface IFeeBreakdown {
    term1: number;
    term2: number;
    bookFee: number;
}

interface MonthPaymentStatus {
    amount: number;
    paidDate: string; // date-only string
    status: MonthPaymentStatusType;
}

interface FeePaymentsFilters {
    academicYearId?: string;
    branchId?: string | null;
    search?: string;
}

interface FeeReportFilters {
    academicYearId?: string;
    branchId?: string;
    className?: string | null;
    shiftName?: string | null;
    section?: string | null;
}

interface SerializedTransaction {
    _id: string;
    receiptNumber?: string;
    date: string | undefined;
    amount?: number;
    paymentMode?: PaymentMode;
    chequeNumber?: string;
    chequeDate: string | null | undefined;
    bankName?: string;
    payeeName?: string;
    upiId?: string;
    upiReference?: string;
    reference?: string;
    remarks?: string;
    breakdown?: IFeeBreakdown;
    monthYear?: string;
    feeTerm?: string;
}

const MONTHS: string[] = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

function normalizeReceiptNumber(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const s = String(raw).trim();
    const m = s.match(/^([cCbB])[- ]?(\d+)$/);
    if (m) return `${m[1].toUpperCase()}-${m[2]}`;
    return s;
}

function normalizeMonthKey(input: string | null | undefined): string | null {
    if (!input) return null;
    const s = String(input).trim();
    if (!s) return null;

    // If already contains a month name
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

function recomputePaidFromTransactions(transactions: Array<{ breakdown?: IFeeBreakdown }> = []): FeeAmounts {
    const paid: FeeAmounts = { term1: 0, term2: 0, bookFee: 0 };
    for (const tx of transactions) {
        paid.term1 += Number(tx?.breakdown?.term1) || 0;
        paid.term2 += Number(tx?.breakdown?.term2) || 0;
        paid.bookFee += Number(tx?.breakdown?.bookFee) || 0;
    }
    return paid;
}

function recomputeStatusesFromPaid(amounts: FeeAmounts, paid: FeeAmounts): FeeHeads {
    const make = (amount: number, paidAmount: number): FeeHead => ({
        amount: Number(amount) || 0,
        paid: Number(paidAmount) || 0,
        status: (amount <= 0 ? 'Paid' : paidAmount >= amount ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Pending') as FeeStatus,
    });
    return {
        term1: make(amounts.term1, paid.term1),
        term2: make(amounts.term2, paid.term2),
        bookFee: make(amounts.bookFee, paid.bookFee),
    };
}

function updateMonthsPaidSequential(
    monthsPaid: Record<string, MonthPaymentStatus>,
    monthName: string,
    amount: number,
    paidDate: string,
): void {
    const idx = MONTHS.indexOf(monthName);

    // Fallback: store raw key without sequential assumptions
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
            if (!existing) {
                monthsPaid[key] = { amount: 0, paidDate, status: 'paid' };
            }
            continue;
        }

        monthsPaid[key] = {
            amount: (Number(existing?.amount) || 0) + (Number(amount) || 0),
            // keep older paidDate if already present (Electron parity)
            paidDate: existing?.paidDate || paidDate,
            status: 'paid',
        };
    }
}

function recomputeMonthsPaidFromTransactions(
    transactions: Array<{ monthYear?: string; amount?: number; date?: string }> = []
): Record<string, MonthPaymentStatus> {
    const out: Record<string, MonthPaymentStatus> = {};
    const sorted = [...(transactions || [])].sort(
        (a, b) => new Date(a?.date || 0).getTime() - new Date(b?.date || 0).getTime()
    );
    for (const tx of sorted) {
        const key = normalizeMonthKey(tx?.monthYear);
        if (!key) continue;
        const dateOnly = dateToISOString(tx?.date || undefined, { dateOnly: true }) || new Date().toISOString().slice(0, 10);
        updateMonthsPaidSequential(out, key, Number(tx?.amount) || 0, dateOnly);
    }
    return out;
}

function feeTermToBreakdown(feeTermRaw: string | null | undefined, amount: number): IFeeBreakdown {
    const amt = Number(amount) || 0;
    const feeTerm = String(feeTermRaw || '').toLowerCase();
    if (feeTerm.includes('term2') || feeTerm.includes('term 2')) return { term1: 0, term2: amt, bookFee: 0 };
    if (feeTerm.includes('book')) return { term1: 0, term2: 0, bookFee: amt };
    return { term1: amt, term2: 0, bookFee: 0 };
}

function inferFeeTerm({
    providedFeeTerm,
    record,
    breakdown,
}: {
    providedFeeTerm: string | null | undefined;
    record: {
        term1_amount: string | number;
        term1_paid: string | number;
        term2_amount: string | number;
        term2_paid: string | number;
        book_fee_amount: string | number;
        book_fee_paid: string | number;
    };
    breakdown?: IFeeBreakdown;
}): 'term1' | 'term2' | 'books' {
    const explicit = String(providedFeeTerm || '').trim();
    if (explicit) {
        const lower = explicit.toLowerCase();
        if (lower.includes('term2') || lower.includes('term 2')) return 'term2';
        if (lower.includes('book')) return 'books';
        return 'term1';
    }

    // If we have a single-head breakdown, infer from it (avoids guessing).
    if (breakdown) {
        const t1 = Number(breakdown.term1) || 0;
        const t2 = Number(breakdown.term2) || 0;
        const bk = Number(breakdown.bookFee) || 0;
        const positive = [t1 > 0, t2 > 0, bk > 0].filter(Boolean).length;
        if (positive === 1) {
            if (t2 > 0) return 'term2';
            if (bk > 0) return 'books';
            return 'term1';
        }
    }

    // Electron parity: pick first term with pending > 0, else first available.
    const term1Amount = Number(record.term1_amount) || 0;
    const term1Paid = Number(record.term1_paid) || 0;
    const term2Amount = Number(record.term2_amount) || 0;
    const term2Paid = Number(record.term2_paid) || 0;
    const booksAmount = Number(record.book_fee_amount) || 0;
    const booksPaid = Number(record.book_fee_paid) || 0;

    const pending = {
        term1: Math.max(0, term1Amount - term1Paid),
        term2: Math.max(0, term2Amount - term2Paid),
        books: Math.max(0, booksAmount - booksPaid),
    };

    const priority: Array<'term1' | 'term2' | 'books'> = ['term1', 'term2', 'books'];
    const firstPending = priority.find((k) => pending[k] > 0);
    if (firstPending) return firstPending;

    const firstWithAmount = priority.find((k) => (k === 'books' ? booksAmount : k === 'term2' ? term2Amount : term1Amount) > 0);
    return firstWithAmount || 'term1';
}

function parseDateInputToISOString(input: string): string {
    const s = String(input || '').trim();
    if (!s) throw new Error('Invalid date');

    // If input is date-only, store at UTC midday to avoid timezone day-shift issues.
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
        const y = Number(m[1]);
        const mo = Number(m[2]) - 1;
        const d = Number(m[3]);
        return new Date(Date.UTC(y, mo, d, 12, 0, 0, 0)).toISOString();
    }

    const dt = new Date(s);
    if (Number.isNaN(dt.getTime())) throw new Error('Invalid date');
    return dt.toISOString();
}

async function ensureReceiptSequence(prefix: string): Promise<void> {
    await dbConnect();
    const p = String(prefix || '').toUpperCase();
    if (!p) return;

    // Initialize with max existing receipt for this prefix (handles legacy imports).
    const maxRows = await sql<Array<{ max_num: number | null }>>`
        SELECT MAX(
            (regexp_match(receipt_number, '(\\d+)$'))[1]::int
        )::int AS max_num
        FROM fee_transactions
        WHERE receipt_number ILIKE (${p} || '%')
    `;
    const maxExisting = maxRows?.[0]?.max_num || 0;

    await sql`
        INSERT INTO receipt_sequences (prefix, last_number, updated_at)
        VALUES (${p}, ${maxExisting}, NOW())
        ON CONFLICT (prefix)
        DO UPDATE SET last_number = GREATEST(receipt_sequences.last_number, EXCLUDED.last_number), updated_at = NOW()
    `;
}

async function generateReceiptNumber(paymentMode: PaymentMode | string): Promise<string> {
    const prefix = paymentMode === 'Cash' ? 'C' : 'B';
    await ensureReceiptSequence(prefix);
    const rows = await sql<Array<{ last_number: number }>>`
        UPDATE receipt_sequences
        SET last_number = last_number + 1, updated_at = NOW()
        WHERE prefix = ${prefix}
        RETURNING last_number
    `;
    const n = rows?.[0]?.last_number;
    if (!n) throw new Error('Failed to generate receipt number');
    return `${prefix}-${n}`;
}

async function loadFeeRecordBase(academicYearId: string, studentId: string) {
    const rows = await sql<Array<{
        id: string;
        academic_year_id: string;
        student_id: string;
        enrollment_id: string | null;
        branch_id: string | null;
        term1_amount: string;
        term1_paid: string;
        term1_status: FeeStatus;
        term2_amount: string;
        term2_paid: string;
        term2_status: FeeStatus;
        book_fee_amount: string;
        book_fee_paid: string;
        book_fee_status: FeeStatus;
        months_paid: unknown;
    }>>`
        SELECT
            id,
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
            months_paid
        FROM fee_records
        WHERE academic_year_id = ${academicYearId}::uuid AND student_id = ${studentId}::uuid
        LIMIT 1
    `;
    return rows?.[0] || null;
}

async function loadTransactionsForFeeRecord(feeRecordId: string): Promise<SerializedTransaction[]> {
    const rows = await sql<Array<{
        id: string;
        receipt_number: string;
        date: string;
        amount: string;
        payment_mode: PaymentMode;
        cheque_number: string | null;
        cheque_date: string | null;
        bank_name: string | null;
        payee_name: string | null;
        upi_id: string | null;
        upi_reference: string | null;
        reference: string | null;
        remarks: string | null;
        breakdown_term1: string;
        breakdown_term2: string;
        breakdown_book_fee: string;
        month_year: string | null;
        fee_term: string;
        created_at: string;
    }>>`
        SELECT
            id,
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
            created_at
        FROM fee_transactions
        WHERE fee_record_id = ${feeRecordId}::uuid
        ORDER BY date DESC, created_at DESC
    `;

    return rows.map((t) => ({
        _id: t.id,
        receiptNumber: normalizeReceiptNumber(t.receipt_number) || undefined,
        date: dateToISOString(t.date),
        amount: Number(t.amount) || 0,
        paymentMode: t.payment_mode,
        chequeNumber: t.cheque_number || undefined,
        chequeDate: t.cheque_date ? dateToISOString(t.cheque_date, { dateOnly: true }) : null,
        bankName: t.bank_name || undefined,
        payeeName: t.payee_name || undefined,
        upiId: t.upi_id || undefined,
        upiReference: t.upi_reference || undefined,
        reference: t.reference || undefined,
        remarks: t.remarks || undefined,
        breakdown: {
            term1: Number(t.breakdown_term1) || 0,
            term2: Number(t.breakdown_term2) || 0,
            bookFee: Number(t.breakdown_book_fee) || 0,
        },
        monthYear: t.month_year || undefined,
        feeTerm: t.fee_term || undefined,
    }));
}

async function recomputeAndPersistFeeRecord(feeRecordId: string): Promise<void> {
    const baseRows = await sql<Array<{
        id: string;
        term1_amount: string;
        term2_amount: string;
        book_fee_amount: string;
    }>>`
        SELECT id, term1_amount, term2_amount, book_fee_amount
        FROM fee_records
        WHERE id = ${feeRecordId}::uuid
        LIMIT 1
    `;
    const base = baseRows?.[0];
    if (!base) return;

    const txRows = await sql<Array<{
        month_year: string | null;
        amount: string;
        date: string;
        breakdown_term1: string;
        breakdown_term2: string;
        breakdown_book_fee: string;
    }>>`
        SELECT month_year, amount, date, breakdown_term1, breakdown_term2, breakdown_book_fee
        FROM fee_transactions
        WHERE fee_record_id = ${feeRecordId}::uuid
        ORDER BY date ASC, created_at ASC
    `;

    const transactions = txRows.map((t) => ({
        monthYear: t.month_year || undefined,
        amount: Number(t.amount) || 0,
        date: t.date,
        breakdown: {
            term1: Number(t.breakdown_term1) || 0,
            term2: Number(t.breakdown_term2) || 0,
            bookFee: Number(t.breakdown_book_fee) || 0,
        },
    }));

    const paid = recomputePaidFromTransactions(transactions);
    const amounts: FeeAmounts = {
        term1: Number(base.term1_amount) || 0,
        term2: Number(base.term2_amount) || 0,
        bookFee: Number(base.book_fee_amount) || 0,
    };
    const fees = recomputeStatusesFromPaid(amounts, paid);
    const monthsPaid = recomputeMonthsPaidFromTransactions(transactions);

    await sql`
        UPDATE fee_records
        SET
            term1_paid = ${fees.term1.paid},
            term1_status = ${fees.term1.status},
            term2_paid = ${fees.term2.paid},
            term2_status = ${fees.term2.status},
            book_fee_paid = ${fees.bookFee.paid},
            book_fee_status = ${fees.bookFee.status},
            months_paid = ${JSON.stringify(monthsPaid)}::jsonb,
            updated_at = NOW()
        WHERE id = ${feeRecordId}::uuid
    `;
}

export async function previewNextReceiptNumber(paymentType: string = 'cash'): Promise<string> {
    await dbConnect();
    const normalized = String(paymentType || 'cash').toLowerCase();
    const paymentMode = normalized === 'cash' ? 'Cash' : 'Bank Transfer';
    const prefix = paymentMode === 'Cash' ? 'C' : 'B';
    await ensureReceiptSequence(prefix);

    const rows = await sql<Array<{ last_number: number }>>`
        SELECT last_number FROM receipt_sequences WHERE prefix = ${prefix} LIMIT 1
    `;
    const next = (rows?.[0]?.last_number || 0) + 1;
    return `${prefix}-${next}`;
}

interface SerializedFeeRecord {
    _id: string;
    academicYearId: string;
    branchId: string | null;
    branchName: string | null;
    studentId: {
        _id: string;
        firstName?: string;
        lastName?: string;
        admissionNumber?: string;
        parentContact1?: string;
    };
    enrollmentId: string | null;
    fees?: FeeHeads;
    transactions: SerializedTransaction[];
    totalDue: number;
    totalPaid: number;
}

export async function getFeeRecords(academicYearId: string): Promise<SerializedFeeRecord[]> {
    if (!academicYearId) return [];
    await dbConnect();

    const rows = await sql<Array<{
        id: string;
        academic_year_id: string;
        branch_id: string | null;
        branch_name: string | null;
        student_id: string;
        first_name: string;
        last_name: string;
        admission_number: string;
        parent_contact1: string | null;
        enrollment_id: string | null;
        term1_amount: string;
        term1_paid: string;
        term1_status: FeeStatus;
        term2_amount: string;
        term2_paid: string;
        term2_status: FeeStatus;
        book_fee_amount: string;
        book_fee_paid: string;
        book_fee_status: FeeStatus;
    }>>`
        SELECT
            fr.id,
            fr.academic_year_id,
            fr.branch_id,
            b.name AS branch_name,
            s.id AS student_id,
            s.first_name,
            s.last_name,
            s.admission_number,
            s.parent_contact1,
            fr.enrollment_id,
            fr.term1_amount,
            fr.term1_paid,
            fr.term1_status,
            fr.term2_amount,
            fr.term2_paid,
            fr.term2_status,
            fr.book_fee_amount,
            fr.book_fee_paid,
            fr.book_fee_status
        FROM fee_records fr
        JOIN students s ON s.id = fr.student_id
        LEFT JOIN branches b ON b.id = fr.branch_id
        WHERE fr.academic_year_id = ${academicYearId}::uuid
        ORDER BY fr.created_at DESC
    `;

    const out: SerializedFeeRecord[] = [];
    for (const r of rows) {
        const transactions = await loadTransactionsForFeeRecord(r.id);
        const fees: FeeHeads = {
            term1: { amount: Number(r.term1_amount) || 0, paid: Number(r.term1_paid) || 0, status: r.term1_status },
            term2: { amount: Number(r.term2_amount) || 0, paid: Number(r.term2_paid) || 0, status: r.term2_status },
            bookFee: { amount: Number(r.book_fee_amount) || 0, paid: Number(r.book_fee_paid) || 0, status: r.book_fee_status },
        };
        const totalDue = fees.term1.amount + fees.term2.amount + fees.bookFee.amount;
        const totalPaid = fees.term1.paid + fees.term2.paid + fees.bookFee.paid;

        out.push({
            _id: r.id,
            academicYearId: r.academic_year_id,
            branchId: r.branch_id,
            branchName: r.branch_name,
            studentId: {
                _id: r.student_id,
                firstName: r.first_name,
                lastName: r.last_name,
                admissionNumber: r.admission_number,
                parentContact1: r.parent_contact1 || undefined,
            },
            enrollmentId: r.enrollment_id,
            fees,
            transactions,
            totalDue,
            totalPaid,
        });
    }

    return out;
}

interface SerializedStudentFeeRecord extends Omit<SerializedFeeRecord, 'academicYearId'> {
    academicYearId: {
        _id: string;
        name?: string;
    };
    studentId: {
        _id: string;
        firstName?: string;
        lastName?: string;
        admissionNumber?: string;
        fatherName?: string;
        motherName?: string;
        parentContact1?: string;
        parentContact2?: string;
    };
    enrollment: {
        _id: string;
        class: string;
        section: string;
        rollNumber: string;
        shiftName: string;
    } | null;
}

export async function getStudentFeeRecord(academicYearId: string, studentId: string): Promise<SerializedStudentFeeRecord | null> {
    await dbConnect();

    const rows = await sql<Array<{
        id: string;
        academic_year_id: string;
        year_name: string;
        branch_id: string | null;
        branch_name: string | null;
        student_id: string;
        first_name: string;
        last_name: string;
        admission_number: string;
        father_name: string | null;
        mother_name: string | null;
        parent_contact1: string | null;
        parent_contact2: string | null;
        enrollment_id: string | null;
        enroll_id: string | null;
        class: string | null;
        section: string | null;
        roll_number: string | null;
        shift_name: string | null;
        term1_amount: string;
        term1_paid: string;
        term1_status: FeeStatus;
        term2_amount: string;
        term2_paid: string;
        term2_status: FeeStatus;
        book_fee_amount: string;
        book_fee_paid: string;
        book_fee_status: FeeStatus;
    }>>`
        SELECT
            fr.id,
            fr.academic_year_id,
            ay.name AS year_name,
            fr.branch_id,
            b.name AS branch_name,
            s.id AS student_id,
            s.first_name,
            s.last_name,
            s.admission_number,
            s.father_name,
            s.mother_name,
            s.parent_contact1,
            s.parent_contact2,
            fr.enrollment_id,
            e.id AS enroll_id,
            e.class,
            e.section,
            e.roll_number,
            e.shift_name,
            fr.term1_amount,
            fr.term1_paid,
            fr.term1_status,
            fr.term2_amount,
            fr.term2_paid,
            fr.term2_status,
            fr.book_fee_amount,
            fr.book_fee_paid,
            fr.book_fee_status
        FROM fee_records fr
        JOIN students s ON s.id = fr.student_id
        JOIN academic_years ay ON ay.id = fr.academic_year_id
        LEFT JOIN branches b ON b.id = fr.branch_id
        LEFT JOIN student_enrollments e ON e.id = fr.enrollment_id
        WHERE fr.academic_year_id = ${academicYearId}::uuid AND fr.student_id = ${studentId}::uuid
        LIMIT 1
    `;
    const r = rows?.[0];
    if (!r) return null;

    const transactions = await loadTransactionsForFeeRecord(r.id);

    const fees: FeeHeads = {
        term1: { amount: Number(r.term1_amount) || 0, paid: Number(r.term1_paid) || 0, status: r.term1_status },
        term2: { amount: Number(r.term2_amount) || 0, paid: Number(r.term2_paid) || 0, status: r.term2_status },
        bookFee: { amount: Number(r.book_fee_amount) || 0, paid: Number(r.book_fee_paid) || 0, status: r.book_fee_status },
    };
    const totalDue = fees.term1.amount + fees.term2.amount + fees.bookFee.amount;
    const totalPaid = fees.term1.paid + fees.term2.paid + fees.bookFee.paid;

    const enrollment = r.enroll_id
        ? {
            _id: r.enroll_id,
            class: r.class || '',
            section: r.section || '',
            rollNumber: r.roll_number || '',
            shiftName: r.shift_name || '',
        }
        : null;

    return {
        _id: r.id,
        academicYearId: { _id: r.academic_year_id, name: r.year_name },
        branchId: r.branch_id,
        branchName: r.branch_name,
        studentId: {
            _id: r.student_id,
            firstName: r.first_name,
            lastName: r.last_name,
            admissionNumber: r.admission_number,
            fatherName: r.father_name || undefined,
            motherName: r.mother_name || undefined,
            parentContact1: r.parent_contact1 || undefined,
            parentContact2: r.parent_contact2 || undefined,
        },
        enrollmentId: r.enrollment_id,
        enrollment,
        fees,
        transactions,
        totalDue,
        totalPaid,
    };
}

export async function recordPayment(formData: FormData): Promise<ActionResult> {
    const academicYearId = formData.get('academicYearId') as string | null;
    const studentId = formData.get('studentId') as string | null;
    const amount = parseFloat((formData.get('amount') as string | null) || '0');
    const paymentMode = (formData.get('paymentMode') as PaymentMode | null) || 'Cash';
    const reference = formData.get('reference') as string | null;
    const remarks = formData.get('remarks') as string | null;

    // Cheque/Bank details
    const chequeNumber = (formData.get('chequeNumber') as string | null) || undefined;
    const chequeDate = (formData.get('chequeDate') as string | null) || undefined;
    const bankName = (formData.get('bankName') as string | null) || undefined;
    const payeeName = (formData.get('payeeName') as string | null) || undefined;

    // UPI details
    const upiId = (formData.get('upiId') as string | null) || undefined;
    const upiReference = (formData.get('upiReference') as string | null) || undefined;

    // Monthly tracking
    const monthYear = (formData.get('monthYear') as string | null) || undefined;
    const paymentDate = (formData.get('paymentDate') as string | null) || undefined;
    const feeTermRaw = ((formData.get('feeTerm') as string | null) || '').trim();

    // Breakdown
    const term1 = parseFloat((formData.get('breakdownTerm1') as string | null) || '0');
    const term2 = parseFloat((formData.get('breakdownTerm2') as string | null) || '0');
    const bookFee = parseFloat((formData.get('breakdownBookFee') as string | null) || '0');

    if (!academicYearId || !studentId) return { error: 'Student and Academic Year are required' };
    if (amount <= 0) return { error: 'Invalid amount' };
    if ((term1 + term2 + bookFee) !== amount) return { error: 'Breakdown totals must match payment amount' };

    try {
        await dbConnect();

        const record = await loadFeeRecordBase(academicYearId, studentId);
        if (!record) return { error: 'Fee Record not found' };

        const inferredFeeTerm = inferFeeTerm({
            providedFeeTerm: feeTermRaw,
            record,
            breakdown: { term1, term2, bookFee },
        });

        const receiptNumber = await generateReceiptNumber(paymentMode);
        const rn = normalizeReceiptNumber(receiptNumber) || receiptNumber;
        const txDateIso = paymentDate ? parseDateInputToISOString(paymentDate) : new Date().toISOString();

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
                fee_term
            )
            VALUES (
                ${record.id},
                ${rn},
                ${txDateIso},
                ${amount},
                ${paymentMode},
                ${chequeNumber || null},
                ${chequeDate || null},
                ${bankName || null},
                ${payeeName || null},
                ${upiId || null},
                ${upiReference || null},
                ${reference || null},
                ${remarks || null},
                ${term1},
                ${term2},
                ${bookFee},
                ${monthYear || null},
                ${inferredFeeTerm}
            )
        `;

        await recomputeAndPersistFeeRecord(record.id);

        revalidatePath('/dashboard/fees');
        revalidatePath('/dashboard/fees/details');
        return { success: true, receiptNumber: rn };
    } catch (error) {
        const err = error as Error;
        const msg = err.message || 'Failed to record payment';
        if (msg.toLowerCase().includes('unique') && msg.toLowerCase().includes('receipt')) {
            return { error: 'Receipt number already exists. Please try again.' };
        }
        return { error: msg };
    }
}

interface FeePaymentRow {
    transactionId: string;
    receiptNumber?: string;
    studentId?: string;
    studentName?: string;
    rollNumber?: string;
    className?: string;
    section?: string;
    shiftName?: string;
    branchName?: string;
    amount?: number;
    paymentType?: string;
    paymentDate?: string;
    monthYear?: string;
    feeTerm?: string;
    payeeName?: string;
    bankName?: string;
    chequeNumber?: string;
    chequeDate?: string;
    upiId?: string;
    upiReference?: string;
    notes?: string;
}

function paymentModeToType(mode: string): string {
    const m = String(mode || '').toLowerCase();
    if (m.includes('cash')) return 'cash';
    if (m.includes('upi')) return 'upi';
    return 'bank';
}

export async function getFeePayments({ academicYearId, branchId = null, search = '' }: FeePaymentsFilters = {}): Promise<FeePaymentRow[]> {
    if (!academicYearId) return [];
    await dbConnect();

    const rows = await sql<Array<{
        transaction_id: string;
        receipt_number: string;
        amount: string;
        payment_mode: string;
        date: string;
        month_year: string | null;
        fee_term: string;
        remarks: string | null;
        bank_name: string | null;
        cheque_number: string | null;
        cheque_date: string | null;
        payee_name: string | null;
        upi_id: string | null;
        upi_reference: string | null;
        student_id: string;
        first_name: string;
        last_name: string;
        branch_name: string | null;
        class: string | null;
        section: string | null;
        roll_number: string | null;
        shift_name: string | null;
    }>>`
        SELECT
            tx.id AS transaction_id,
            tx.receipt_number,
            tx.amount,
            tx.payment_mode,
            tx.date,
            tx.month_year,
            tx.fee_term,
            tx.remarks,
            tx.bank_name,
            tx.cheque_number,
            tx.cheque_date,
            tx.payee_name,
            tx.upi_id,
            tx.upi_reference,
            s.id AS student_id,
            s.first_name,
            s.last_name,
            b.name AS branch_name,
            e.class,
            e.section,
            e.roll_number,
            e.shift_name
        FROM fee_transactions tx
        JOIN fee_records fr ON fr.id = tx.fee_record_id
        JOIN students s ON s.id = fr.student_id
        LEFT JOIN branches b ON b.id = fr.branch_id
        LEFT JOIN student_enrollments e ON e.id = fr.enrollment_id
        WHERE fr.academic_year_id = ${academicYearId}::uuid
          AND (${branchId}::uuid IS NULL OR fr.branch_id = ${branchId}::uuid)
        ORDER BY tx.date DESC, tx.created_at DESC
    `;

    const mapped = rows.map((r) => ({
        transactionId: r.transaction_id,
        receiptNumber: normalizeReceiptNumber(r.receipt_number) || r.receipt_number,
        studentId: r.student_id,
        studentName: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
        rollNumber: r.roll_number || undefined,
        className: r.class || undefined,
        section: r.section || undefined,
        shiftName: r.shift_name || undefined,
        branchName: r.branch_name || undefined,
        amount: Number(r.amount) || 0,
        paymentType: paymentModeToType(r.payment_mode),
        paymentDate: dateToISOString(r.date, { dateOnly: true }),
        monthYear: r.month_year || undefined,
        feeTerm: r.fee_term || undefined,
        payeeName: r.payee_name || undefined,
        bankName: r.bank_name || undefined,
        chequeNumber: r.cheque_number || undefined,
        chequeDate: r.cheque_date ? dateToISOString(r.cheque_date, { dateOnly: true }) : undefined,
        upiId: r.upi_id || undefined,
        upiReference: r.upi_reference || undefined,
        notes: r.remarks || undefined,
    }));

    const q = String(search || '').trim().toLowerCase();
    const filtered = q
        ? mapped.filter((r) =>
            String(r.receiptNumber || '').toLowerCase().includes(q) ||
            String(r.studentName || '').toLowerCase().includes(q) ||
            String(r.rollNumber || '').toLowerCase().includes(q) ||
            String(r.className || '').toLowerCase().includes(q)
        )
        : mapped;

    filtered.sort((a, b) => new Date(b.paymentDate || 0).getTime() - new Date(a.paymentDate || 0).getTime());
    return filtered;
}

export async function addFeePayment(formData: FormData): Promise<ActionResult> {
    const academicYearId = formData.get('academicYearId') as string | null;
    const studentId = formData.get('studentId') as string | null;
    const amount = parseFloat((formData.get('amount') as string | null) || '0');
    const paymentType = ((formData.get('paymentType') as string | null) || 'cash').trim().toLowerCase();
    const paymentMode: PaymentMode = paymentType === 'cash' ? 'Cash' : paymentType === 'upi' ? 'UPI' : 'Bank Transfer';

    const monthYear = ((formData.get('monthYear') as string | null) || '').trim();
    const paymentDate = ((formData.get('paymentDate') as string | null) || '').trim();
    const feeTermRaw = ((formData.get('feeTerm') as string | null) || '').trim();
    const notes = ((formData.get('notes') as string | null) || '');

    const bankName = ((formData.get('bankName') as string | null) || '').trim();
    const chequeNumber = ((formData.get('chequeNumber') as string | null) || '').trim();
    const chequeDate = ((formData.get('chequeDate') as string | null) || '').trim();
    const payeeName = ((formData.get('payeeName') as string | null) || '').trim();

    const upiId = ((formData.get('upiId') as string | null) || '').trim();
    const upiReference = ((formData.get('upiReference') as string | null) || '').trim();

    if (!academicYearId || !studentId) return { error: 'Student and Academic Year are required' };
    if (!monthYear) return { error: 'Upto Month is required' };
    if (!paymentDate) return { error: 'Payment Date is required' };
    if (!amount || amount <= 0) return { error: 'Valid amount is required' };
    if (paymentType === 'bank' && !payeeName) return { error: 'Payee name is required for bank payments' };

    await dbConnect();
    const record = await loadFeeRecordBase(academicYearId, studentId);
    if (!record) return { error: 'Fee Record not found' };

    const inferredFeeTerm = inferFeeTerm({ providedFeeTerm: feeTermRaw, record });
    const receiptNumber = await generateReceiptNumber(paymentMode);
    const rn = normalizeReceiptNumber(receiptNumber) || receiptNumber;
    const txDateIso = parseDateInputToISOString(paymentDate);
    const breakdown = feeTermToBreakdown(inferredFeeTerm, amount);

    try {
        await sql`
            INSERT INTO fee_transactions (
                fee_record_id,
                receipt_number,
                date,
                amount,
                payment_mode,
                remarks,
                bank_name,
                cheque_number,
                cheque_date,
                payee_name,
                upi_id,
                upi_reference,
                breakdown_term1,
                breakdown_term2,
                breakdown_book_fee,
                month_year,
                fee_term
            )
            VALUES (
                ${record.id},
                ${rn},
                ${txDateIso},
                ${amount},
                ${paymentMode},
                ${notes || null},
                ${bankName || null},
                ${chequeNumber || null},
                ${chequeDate || null},
                ${payeeName || null},
                ${upiId || null},
                ${upiReference || null},
                ${breakdown.term1},
                ${breakdown.term2},
                ${breakdown.bookFee},
                ${monthYear || null},
                ${inferredFeeTerm}
            )
        `;

        await recomputeAndPersistFeeRecord(record.id);

        revalidatePath('/dashboard/fees');
        revalidatePath('/dashboard/fees/details');
        return { success: true, receiptNumber: rn };
    } catch (error) {
        const err = error as Error;
        const msg = err.message || 'Failed to add fee payment';
        if (msg.toLowerCase().includes('unique') && msg.toLowerCase().includes('receipt')) {
            return { error: 'Receipt number already exists. Please try again.' };
        }
        return { error: msg };
    }
}

export async function updateFeePayment(transactionId: string, formData: FormData): Promise<ActionResult> {
    if (!transactionId) return { error: 'Transaction is required' };
    await dbConnect();

    const txRows = await sql<Array<{ fee_record_id: string; receipt_number: string; amount: string; payment_mode: string; date: string; month_year: string | null; fee_term: string; remarks: string | null; bank_name: string | null; cheque_number: string | null; cheque_date: string | null; payee_name: string | null; upi_id: string | null; upi_reference: string | null }>>`
        SELECT fee_record_id, receipt_number, amount, payment_mode, date, month_year, fee_term, remarks, bank_name, cheque_number, cheque_date, payee_name, upi_id, upi_reference
        FROM fee_transactions
        WHERE id = ${transactionId}::uuid
        LIMIT 1
    `;
    const current = txRows?.[0];
    if (!current) return { error: 'Transaction not found' };

    const amount = parseFloat((formData.get('amount') as string | null) || String(current.amount || '0'));
    const paymentType = ((formData.get('paymentType') as string | null) || '').trim().toLowerCase();
    const nextPaymentMode: PaymentMode =
        paymentType === 'cash' ? 'Cash' :
        paymentType === 'upi' ? 'UPI' :
        paymentType === 'cheque' ? 'Cheque' :
        paymentType === 'bank' ? 'Bank Transfer' :
        (current.payment_mode as PaymentMode);

    const monthYear = ((formData.get('monthYear') as string | null) ?? current.month_year ?? '').trim();
    const paymentDate = ((formData.get('paymentDate') as string | null) ?? dateToISOString(current.date, { dateOnly: true }) ?? '').trim();
    const feeTermRaw = ((formData.get('feeTerm') as string | null) ?? current.fee_term ?? '').trim();
    const notes = ((formData.get('notes') as string | null) ?? current.remarks ?? '').toString();

    const bankName = ((formData.get('bankName') as string | null) ?? current.bank_name ?? '').trim();
    const chequeNumber = ((formData.get('chequeNumber') as string | null) ?? current.cheque_number ?? '').trim();
    const chequeDate = ((formData.get('chequeDate') as string | null) ?? current.cheque_date ?? '').trim();
    const payeeName = ((formData.get('payeeName') as string | null) ?? current.payee_name ?? '').trim();

    const upiId = ((formData.get('upiId') as string | null) ?? current.upi_id ?? '').trim();
    const upiReference = ((formData.get('upiReference') as string | null) ?? current.upi_reference ?? '').trim();

    if (!paymentDate) return { error: 'Payment Date is required' };
    if (!amount || amount <= 0) return { error: 'Valid amount is required' };
    if (!monthYear) return { error: 'Upto Month is required' };
    if (paymentType === 'bank' && !payeeName) return { error: 'Payee name is required for bank payments' };

    // If fee_term is missing (legacy), infer a stable term based on current fee record state.
    const recordRows = await sql<Array<{
        term1_amount: string;
        term1_paid: string;
        term2_amount: string;
        term2_paid: string;
        book_fee_amount: string;
        book_fee_paid: string;
    }>>`
        SELECT term1_amount, term1_paid, term2_amount, term2_paid, book_fee_amount, book_fee_paid
        FROM fee_records
        WHERE id = ${current.fee_record_id}::uuid
        LIMIT 1
    `;
    const record = recordRows?.[0];
    const inferredFeeTerm = record
        ? inferFeeTerm({ providedFeeTerm: feeTermRaw, record })
        : (feeTermRaw ? (feeTermRaw.toLowerCase().includes('term2') ? 'term2' : feeTermRaw.toLowerCase().includes('book') ? 'books' : 'term1') : 'term1');

    const breakdown = feeTermToBreakdown(inferredFeeTerm, amount);

    await sql`
        UPDATE fee_transactions
        SET
            amount = ${amount},
            payment_mode = ${nextPaymentMode},
            date = ${parseDateInputToISOString(paymentDate)},
            month_year = ${monthYear || null},
            fee_term = ${inferredFeeTerm},
            remarks = ${notes || null},
            bank_name = ${bankName || null},
            cheque_number = ${chequeNumber || null},
            cheque_date = ${chequeDate || null},
            payee_name = ${payeeName || null},
            upi_id = ${upiId || null},
            upi_reference = ${upiReference || null},
            breakdown_term1 = ${breakdown.term1},
            breakdown_term2 = ${breakdown.term2},
            breakdown_book_fee = ${breakdown.bookFee}
        WHERE id = ${transactionId}::uuid
    `;

    await recomputeAndPersistFeeRecord(current.fee_record_id);

    revalidatePath('/dashboard/fees');
    revalidatePath('/dashboard/fees/details');
    return { success: true };
}

export async function deleteFeePayment(transactionId: string): Promise<ActionResult> {
    if (!transactionId) return { error: 'Transaction is required' };
    await dbConnect();

    const deleted = await sql<Array<{ fee_record_id: string }>>`
        DELETE FROM fee_transactions
        WHERE id = ${transactionId}::uuid
        RETURNING fee_record_id
    `;
    const feeRecordId = deleted?.[0]?.fee_record_id;
    if (!feeRecordId) return { error: 'Transaction not found' };

    await recomputeAndPersistFeeRecord(feeRecordId);

    revalidatePath('/dashboard/fees');
    revalidatePath('/dashboard/fees/details');
    return { success: true };
}

interface FeeStats {
    totalDue: number;
    totalCollected: number;
    totalPending: number;
    todayCollection: number;
    monthCollection: number;
}

export async function getFeeStats(academicYearId: string | null, branchId: string | null = null): Promise<FeeStats> {
    await dbConnect();

    const year = academicYearId || null;

    const rows = await sql<Array<{
        total_due: string;
        total_paid: string;
    }>>`
        SELECT
            SUM(term1_amount + term2_amount + book_fee_amount)::numeric AS total_due,
            SUM(term1_paid + term2_paid + book_fee_paid)::numeric AS total_paid
        FROM fee_records
        WHERE (${year}::uuid IS NULL OR academic_year_id = ${year}::uuid)
          AND (${branchId}::uuid IS NULL OR branch_id = ${branchId}::uuid)
    `;
    const totalDue = Number(rows?.[0]?.total_due) || 0;
    const totalCollected = Number(rows?.[0]?.total_paid) || 0;

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

    const txRows = await sql<Array<{ today_amt: string; month_amt: string }>>`
        SELECT
            COALESCE(SUM(CASE WHEN tx.date >= ${startOfDay}::timestamptz THEN tx.amount ELSE 0 END), 0)::numeric AS today_amt,
            COALESCE(SUM(CASE WHEN tx.date >= ${startOfMonth}::timestamptz THEN tx.amount ELSE 0 END), 0)::numeric AS month_amt
        FROM fee_transactions tx
        JOIN fee_records fr ON fr.id = tx.fee_record_id
        WHERE (${year}::uuid IS NULL OR fr.academic_year_id = ${year}::uuid)
          AND (${branchId}::uuid IS NULL OR fr.branch_id = ${branchId}::uuid)
    `;

    const todayCollection = Number(txRows?.[0]?.today_amt) || 0;
    const monthCollection = Number(txRows?.[0]?.month_amt) || 0;

    return {
        totalDue,
        totalCollected,
        totalPending: totalDue - totalCollected,
        todayCollection,
        monthCollection,
    };
}

interface RecentTransaction {
    _id: string;
    date: string | undefined;
    amount?: number;
    paymentMode?: string;
    receiptNumber?: string;
    studentName: string;
    admissionNumber?: string;
}

export async function getRecentTransactions(limit: number = 5, branchId: string | null = null): Promise<RecentTransaction[]> {
    await dbConnect();

    const rows = await sql<Array<{
        id: string;
        date: string;
        amount: string;
        payment_mode: string;
        receipt_number: string;
        first_name: string;
        last_name: string;
        admission_number: string;
    }>>`
        SELECT
            tx.id,
            tx.date,
            tx.amount,
            tx.payment_mode,
            tx.receipt_number,
            s.first_name,
            s.last_name,
            s.admission_number
        FROM fee_transactions tx
        JOIN fee_records fr ON fr.id = tx.fee_record_id
        JOIN students s ON s.id = fr.student_id
        WHERE (${branchId}::uuid IS NULL OR fr.branch_id = ${branchId}::uuid)
        ORDER BY tx.date DESC, tx.created_at DESC
        LIMIT ${limit}
    `;

    return rows.map((r) => ({
        _id: r.id,
        date: dateToISOString(r.date),
        amount: Number(r.amount) || 0,
        paymentMode: r.payment_mode || undefined,
        receiptNumber: normalizeReceiptNumber(r.receipt_number) || r.receipt_number,
        studentName: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
        admissionNumber: r.admission_number || undefined,
    }));
}

interface TermSummary {
    terms: {
        term1: { total: number; paid: number; pending: number };
        term2: { total: number; paid: number; pending: number };
        books: { total: number; paid: number; pending: number };
    };
    totals: {
        total: number;
        paid: number;
        pending: number;
    };
}

interface TermSummaryResult {
    success: boolean;
    error?: string;
    summary?: TermSummary;
}

export async function getStudentTermSummary(studentId: string, academicYearId: string | null = null): Promise<TermSummaryResult> {
    if (!studentId) return { success: false, error: 'Student is required' };
    await dbConnect();

    const recordRows = await sql<Array<{
        term1_amount: string;
        term1_paid: string;
        term2_amount: string;
        term2_paid: string;
        book_fee_amount: string;
        book_fee_paid: string;
    }>>`
        SELECT term1_amount, term1_paid, term2_amount, term2_paid, book_fee_amount, book_fee_paid
        FROM fee_records
        WHERE student_id = ${studentId}::uuid
          AND (${academicYearId}::uuid IS NULL OR academic_year_id = ${academicYearId}::uuid)
        ORDER BY created_at DESC
        LIMIT 1
    `;
    const r = recordRows?.[0];
    if (!r) return { success: false, error: 'Fee record not found' };

    const term1Total = Number(r.term1_amount) || 0;
    const term1Paid = Number(r.term1_paid) || 0;
    const term2Total = Number(r.term2_amount) || 0;
    const term2Paid = Number(r.term2_paid) || 0;
    const booksTotal = Number(r.book_fee_amount) || 0;
    const booksPaid = Number(r.book_fee_paid) || 0;

    const summary: TermSummary = {
        terms: {
            term1: { total: term1Total, paid: term1Paid, pending: Math.max(0, term1Total - term1Paid) },
            term2: { total: term2Total, paid: term2Paid, pending: Math.max(0, term2Total - term2Paid) },
            books: { total: booksTotal, paid: booksPaid, pending: Math.max(0, booksTotal - booksPaid) },
        },
        totals: {
            total: term1Total + term2Total + booksTotal,
            paid: term1Paid + term2Paid + booksPaid,
            pending: Math.max(0, (term1Total + term2Total + booksTotal) - (term1Paid + term2Paid + booksPaid)),
        },
    };

    return { success: true, summary };
}

interface MonthStatus {
    paid: boolean;
    amount: number;
    paid_date: string | null;
    status: string;
}

interface MonthsStatusResult {
    success: boolean;
    error?: string;
    monthsStatus?: Record<string, MonthStatus>;
}

export async function getStudentMonthsStatus(studentId: string, academicYearId: string): Promise<MonthsStatusResult> {
    if (!studentId || !academicYearId) return { success: false, error: 'Student and Academic Year are required' };
    await dbConnect();

    const recordRows = await sql<Array<{ months_paid: unknown }>>`
        SELECT months_paid
        FROM fee_records
        WHERE student_id = ${studentId}::uuid AND academic_year_id = ${academicYearId}::uuid
        LIMIT 1
    `;
    const raw = recordRows?.[0]?.months_paid as any;
    if (!recordRows?.length) return { success: false, error: 'Fee record not found' };

    const monthsStatus: Record<string, MonthStatus> = {};
    if (raw && typeof raw === 'object') {
        for (const [month, status] of Object.entries(raw as Record<string, any>)) {
            const amount = Number((status as any)?.amount) || 0;
            const paidDate = (status as any)?.paidDate ? String((status as any).paidDate) : null;
            monthsStatus[month] = {
                paid: true,
                amount,
                paid_date: paidDate || null,
                status: String((status as any)?.status || 'paid'),
            };
        }
    }

    return { success: true, monthsStatus };
}

interface FeeReportRow {
    _id: string;
    name: string;
    rollNumber: string;
    className: string;
    shiftName: string;
    section: string;
    termSummary: {
        terms: {
            term1: { total: number; paid: number; pending: number };
            term2: { total: number; paid: number; pending: number };
            books: { total: number; paid: number; pending: number };
        };
    };
}

export async function getFeeReportRows({
    academicYearId,
    branchId,
    className = null,
    shiftName = null,
    section = null,
}: FeeReportFilters = {}): Promise<FeeReportRow[]> {
    if (!academicYearId || !branchId) return [];
    await dbConnect();

    const sect = section ? String(section).trim().toUpperCase() : null;

    const rows = await sql<Array<{
        student_id: string;
        first_name: string;
        last_name: string;
        roll_number: string | null;
        class: string;
        shift_name: string;
        section: string;
        term1_amount: string;
        term1_paid: string;
        term2_amount: string;
        term2_paid: string;
        book_fee_amount: string;
        book_fee_paid: string;
    }>>`
        SELECT
            s.id AS student_id,
            s.first_name,
            s.last_name,
            e.roll_number,
            e.class,
            e.shift_name,
            e.section,
            fr.term1_amount,
            fr.term1_paid,
            fr.term2_amount,
            fr.term2_paid,
            fr.book_fee_amount,
            fr.book_fee_paid
        FROM student_enrollments e
        JOIN students s ON s.id = e.student_id
        LEFT JOIN fee_records fr ON fr.student_id = s.id AND fr.academic_year_id = e.academic_year_id
        WHERE e.academic_year_id = ${academicYearId}::uuid
          AND e.status = 'Active'
          AND s.is_active = true
          AND s.branch_id = ${branchId}::uuid
          AND (${className}::text IS NULL OR e.class = ${className})
          AND (${shiftName}::text IS NULL OR e.shift_name = ${shiftName})
          AND (${sect}::text IS NULL OR e.section = ${sect})
        ORDER BY e.class ASC, e.section ASC, e.roll_number ASC NULLS LAST
    `;

    return rows.map((r) => {
        const name = `${r.first_name || ''} ${r.last_name || ''}`.trim();
        const t1Total = Number(r.term1_amount) || 0;
        const t1Paid = Number(r.term1_paid) || 0;
        const t2Total = Number(r.term2_amount) || 0;
        const t2Paid = Number(r.term2_paid) || 0;
        const bTotal = Number(r.book_fee_amount) || 0;
        const bPaid = Number(r.book_fee_paid) || 0;

        return {
            _id: r.student_id,
            name,
            rollNumber: r.roll_number || '',
            className: r.class || '',
            shiftName: r.shift_name || '',
            section: r.section || '',
            termSummary: {
                terms: {
                    term1: { total: t1Total, paid: t1Paid, pending: Math.max(0, t1Total - t1Paid) },
                    term2: { total: t2Total, paid: t2Paid, pending: Math.max(0, t2Total - t2Paid) },
                    books: { total: bTotal, paid: bPaid, pending: Math.max(0, bTotal - bPaid) },
                },
            },
        };
    });
}
