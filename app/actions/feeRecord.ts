'use server';

import dbConnect from '@/lib/db';
import { dateToISOString, idToString, pickRefName } from '@/lib/serialize';
import FeeRecord from '@/models/FeeRecord';
import ReceiptSequence from '@/models/ReceiptSequence';
import StudentEnrollment from '@/models/StudentEnrollment';
import { revalidatePath } from 'next/cache';
import type { IFeeRecordDocument, ITransaction, IFeeBreakdown, PaymentMode, FeeStatus, IMonthPayment, MonthPaymentStatus as MonthPaymentStatusType } from '@/types';
import type { FilterQuery, Types } from 'mongoose';

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

interface MonthPaymentStatus {
    amount: number;
    paidDate: Date;
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

interface PopulatedStudent {
    _id: Types.ObjectId;
    firstName?: string;
    lastName?: string;
    admissionNumber?: string;
    fatherName?: string;
    motherName?: string;
    parentContact1?: string;
    parentContact2?: string;
}

interface PopulatedEnrollment {
    _id: Types.ObjectId;
    class?: string;
    section?: string;
    rollNumber?: string;
    shiftName?: string;
}

interface PopulatedBranch {
    _id: Types.ObjectId;
    name?: string;
}

interface PopulatedAcademicYear {
    _id: Types.ObjectId;
    name?: string;
}

interface MongoError extends Error {
    code?: number;
}

const MONTHS: string[] = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

function normalizeReceiptNumber(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const s = String(raw).trim();
    const m = s.match(/^([cCbB])[- ]?(\d+)$/);
    if (m) {
        return `${m[1].toUpperCase()}-${m[2]}`;
    }
    return s;
}

async function getCurrentMaxReceiptNumber(prefix: string): Promise<number> {
    const re = new RegExp(`^${prefix}[- ]?\\d+$`, 'i');
    const records = await FeeRecord.find(
        { 'transactions.receiptNumber': { $regex: re } },
        { 'transactions.receiptNumber': 1 }
    ).lean();

    let max = 0;
    for (const r of records) {
        const feeRecord = r as { transactions?: Array<{ receiptNumber?: string }> };
        for (const tx of feeRecord.transactions || []) {
            const rn = String(tx?.receiptNumber || '');
            const m = rn.match(/(\d+)$/);
            if (!m) continue;
            const n = parseInt(m[1], 10);
            if (Number.isFinite(n) && n > max) max = n;
        }
    }
    return max;
}

async function ensureReceiptSequence(prefix: string): Promise<void> {
    await dbConnect();

    const existing = await ReceiptSequence.findOne({ prefix }).lean();
    if (existing) return;

    const maxExisting = await getCurrentMaxReceiptNumber(prefix);
    try {
        await ReceiptSequence.create({ prefix, lastNumber: maxExisting });
    } catch (e) {
        const err = e as MongoError;
        // concurrent init is fine
        if (err?.code !== 11000) throw e;
    }
}

async function generateReceiptNumber(paymentMode: PaymentMode | string): Promise<string> {
    const prefix = paymentMode === 'Cash' ? 'C' : 'B';
    await ensureReceiptSequence(prefix);
    const seq = await ReceiptSequence.findOneAndUpdate(
        { prefix },
        { $inc: { lastNumber: 1 } },
        { new: true }
    );
    if (!seq) throw new Error('Failed to generate receipt number');
    return `${prefix}-${seq.lastNumber}`;
}

export async function previewNextReceiptNumber(paymentType: string = 'cash'): Promise<string> {
    await dbConnect();
    const normalized = String(paymentType || 'cash').toLowerCase();
    const paymentMode = normalized === 'cash' ? 'Cash' : 'Bank Transfer';
    const prefix = paymentMode === 'Cash' ? 'C' : 'B';
    await ensureReceiptSequence(prefix);
    const seq = await ReceiptSequence.findOne({ prefix }).lean();
    const seqDoc = seq as { lastNumber?: number } | null;
    const next = (seqDoc?.lastNumber || 0) + 1;
    return `${prefix}-${next}`;
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

function updateMonthsPaidSequential(
    monthsPaidMap: Map<string, MonthPaymentStatus>,
    monthName: string,
    amount: number,
    paidDate: Date = new Date()
): void {
    const idx = MONTHS.indexOf(monthName);

    // Fallback: store raw key without sequential assumptions
    if (idx === -1) {
        const current = monthsPaidMap.get(monthName);
        monthsPaidMap.set(monthName, {
            amount: (Number(current?.amount) || 0) + (Number(amount) || 0),
            paidDate,
            status: 'paid' as MonthPaymentStatusType,
        });
        return;
    }

    for (let i = 0; i <= idx; i++) {
        const key = MONTHS[i];
        const isTarget = i === idx;
        const current = monthsPaidMap.get(key);

        // Electron parity:
        // - Paying month X marks all months up to X as paid.
        // - Earlier months keep their original paid_date (do not overwrite).
        // - Only the target month receives the payment amount.
        if (!isTarget) {
            if (!current) {
                monthsPaidMap.set(key, { amount: 0, paidDate, status: 'paid' });
            }
            continue;
        }

        monthsPaidMap.set(key, {
            amount: (Number(current?.amount) || 0) + (Number(amount) || 0),
            paidDate,
            status: 'paid' as MonthPaymentStatusType,
        });
    }
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

function recomputeStatuses(fees: FeeHeads): void {
    const heads: FeeHeadKey[] = ['term1', 'term2', 'bookFee'];
    for (const head of heads) {
        const amount = Number(fees?.[head]?.amount) || 0;
        const paid = Number(fees?.[head]?.paid) || 0;
        fees[head].status = amount <= 0 ? 'Paid' : paid >= amount ? 'Paid' : paid > 0 ? 'Partial' : 'Pending';
    }
}

function recomputeMonthsPaidFromTransactions(
    monthsPaidMap: Map<string, MonthPaymentStatus>,
    transactions: Array<{ monthYear?: string; amount?: number; date?: Date | string }> = []
): void {
    monthsPaidMap.clear();
    const sorted = [...(transactions || [])].sort(
        (a, b) => new Date(a?.date || 0).getTime() - new Date(b?.date || 0).getTime()
    );
    for (const tx of sorted) {
        const key = normalizeMonthKey(tx?.monthYear);
        if (!key) continue;
        updateMonthsPaidSequential(
            monthsPaidMap,
            key,
            tx?.amount || 0,
            tx?.date ? new Date(tx.date) : new Date()
        );
    }
}

function serializeTransactions(transactions: ITransaction[] | undefined): SerializedTransaction[] {
    return (transactions || []).map((t) => ({
        ...t,
        _id: idToString((t as { _id?: Types.ObjectId })._id) || '',
        date: dateToISOString(t?.date),
        chequeDate: dateToISOString(t?.chequeDate) || null,
    }));
}

function feeTermToBreakdown(feeTermRaw: string | null | undefined, amount: number): IFeeBreakdown {
    const amt = Number(amount) || 0;
    const feeTerm = String(feeTermRaw || '').toLowerCase();
    if (feeTerm.includes('term2') || feeTerm.includes('term 2')) {
        return { term1: 0, term2: amt, bookFee: 0 };
    }
    if (feeTerm.includes('book')) {
        return { term1: 0, term2: 0, bookFee: amt };
    }
    // Default: term1
    return { term1: amt, term2: 0, bookFee: 0 };
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

    const records = await FeeRecord.find({ academicYearId })
        .populate('studentId', 'firstName lastName admissionNumber parentContact1')
        .populate('branchId', 'name')
        .sort({ createdAt: -1 })
        .lean();

    interface FeeRecordLean {
        _id: Types.ObjectId;
        academicYearId?: Types.ObjectId;
        branchId?: PopulatedBranch | Types.ObjectId;
        studentId?: PopulatedStudent;
        enrollmentId?: Types.ObjectId;
        fees?: FeeHeads;
        transactions?: ITransaction[];
    }

    return (records as unknown as FeeRecordLean[]).map(r => ({
        ...r,
        _id: idToString(r._id) || '',
        academicYearId: idToString(r.academicYearId) || '',
        branchId: idToString(r.branchId),
        branchName: pickRefName(r.branchId as PopulatedBranch),
        studentId: {
            ...r.studentId,
            _id: idToString(r.studentId?._id) || '',
        },
        enrollmentId: idToString(r.enrollmentId),
        transactions: serializeTransactions(r.transactions),
        // Computed fields
        totalDue: (r.fees?.term1?.amount || 0) + (r.fees?.term2?.amount || 0) + (r.fees?.bookFee?.amount || 0),
        totalPaid: (r.fees?.term1?.paid || 0) + (r.fees?.term2?.paid || 0) + (r.fees?.bookFee?.paid || 0),
    }));
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
    const record = await FeeRecord.findOne({ academicYearId, studentId })
        .populate('studentId', 'firstName lastName admissionNumber fatherName motherName parentContact1 parentContact2')
        .populate('academicYearId', 'name')
        .populate('branchId', 'name')
        .populate('enrollmentId', 'class section rollNumber shiftName')
        .lean();

    if (!record) return null;

    interface FeeRecordLean {
        _id: Types.ObjectId;
        academicYearId?: PopulatedAcademicYear | Types.ObjectId;
        branchId?: PopulatedBranch | Types.ObjectId;
        studentId?: PopulatedStudent;
        enrollmentId?: PopulatedEnrollment | Types.ObjectId;
        fees?: FeeHeads;
        transactions?: ITransaction[];
    }

    const r = record as unknown as FeeRecordLean;
    const enrollment = r.enrollmentId && typeof r.enrollmentId === 'object' && '_id' in r.enrollmentId
        ? r.enrollmentId as PopulatedEnrollment
        : null;

    return {
        ...r,
        _id: idToString(r._id) || '',
        academicYearId: {
            ...(r.academicYearId as PopulatedAcademicYear),
            _id: idToString((r.academicYearId as PopulatedAcademicYear)?._id) || '',
        },
        branchId: idToString(r.branchId),
        branchName: pickRefName(r.branchId as PopulatedBranch),
        studentId: {
            ...r.studentId,
            _id: idToString(r.studentId?._id) || '',
        },
        enrollmentId: idToString(enrollment || r.enrollmentId),
        enrollment: enrollment
            ? {
                _id: idToString(enrollment._id) || '',
                class: enrollment.class || '',
                section: enrollment.section || '',
                rollNumber: enrollment.rollNumber || '',
                shiftName: enrollment.shiftName || '',
            }
            : null,
        transactions: serializeTransactions(r.transactions),
        totalDue: (r.fees?.term1?.amount || 0) + (r.fees?.term2?.amount || 0) + (r.fees?.bookFee?.amount || 0),
        totalPaid: (r.fees?.term1?.paid || 0) + (r.fees?.term2?.paid || 0) + (r.fees?.bookFee?.paid || 0),
    };
}

export async function recordPayment(formData: FormData): Promise<ActionResult> {
    const academicYearId = formData.get('academicYearId') as string | null;
    const studentId = formData.get('studentId') as string | null;
    const amount = parseFloat((formData.get('amount') as string | null) || '0');
    const paymentMode = formData.get('paymentMode') as PaymentMode | null;
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

    // For monthly tracking
    const monthYear = (formData.get('monthYear') as string | null) || undefined;
    const paymentDate = (formData.get('paymentDate') as string | null) || undefined;
    const feeTerm = ((formData.get('feeTerm') as string | null) || '').trim();

    // Breakdown
    const term1 = parseFloat((formData.get('breakdownTerm1') as string | null) || '0');
    const term2 = parseFloat((formData.get('breakdownTerm2') as string | null) || '0');
    const bookFee = parseFloat((formData.get('breakdownBookFee') as string | null) || '0');

    if (amount <= 0) return { error: 'Invalid amount' };
    if ((term1 + term2 + bookFee) !== amount) {
        return { error: 'Breakdown totals must match payment amount' };
    }

    try {
        await dbConnect();
        const record = await FeeRecord.findOne({ academicYearId, studentId }) as IFeeRecordDocument | null;
        if (!record) return { error: 'Fee Record not found' };

        const receiptNumber = await generateReceiptNumber(paymentMode || 'Cash');

        record.fees.term1.paid += term1;
        record.fees.term2.paid += term2;
        record.fees.bookFee.paid += bookFee;

        const heads: FeeHeadKey[] = ['term1', 'term2', 'bookFee'];
        heads.forEach(head => {
            if (record.fees[head].paid >= record.fees[head].amount) {
                record.fees[head].status = 'Paid';
            } else if (record.fees[head].paid > 0) {
                record.fees[head].status = 'Partial';
            }
        });

        const txDate = paymentDate ? new Date(paymentDate) : new Date();
        const transaction: Partial<ITransaction> = {
            receiptNumber: normalizeReceiptNumber(receiptNumber) || undefined,
            amount,
            paymentMode: paymentMode || 'Cash',
            reference: reference || undefined,
            remarks: remarks || undefined,
            breakdown: { term1, term2, bookFee },
            date: txDate,
            monthYear,
            feeTerm,
        };

        if (paymentMode === 'Cheque' || paymentMode === 'Bank Transfer') {
            if (chequeNumber) transaction.chequeNumber = chequeNumber;
            if (chequeDate) transaction.chequeDate = new Date(chequeDate);
            if (bankName) transaction.bankName = bankName;
            if (payeeName) transaction.payeeName = payeeName;
        }

        if (paymentMode === 'UPI') {
            if (upiId) transaction.upiId = upiId;
            if (upiReference) transaction.upiReference = upiReference;
            if (payeeName) transaction.payeeName = payeeName;
        }

        record.transactions.push(transaction as ITransaction);

        // Update monthly tracking if provided
        if (monthYear) {
            const key = normalizeMonthKey(monthYear);
            if (key) {
                const monthsPaidMap = new Map<string, MonthPaymentStatus>();
                // Convert existing monthsPaid to Map
                if (record.monthsPaid && typeof record.monthsPaid === 'object') {
                    const existingMonths = record.monthsPaid as Map<string, IMonthPayment>;
                    existingMonths.forEach((value, k) => {
                        monthsPaidMap.set(k, {
                            amount: value.amount,
                            paidDate: value.paidDate,
                            status: value.status,
                        });
                    });
                }
                updateMonthsPaidSequential(monthsPaidMap, key, amount, txDate);
                // Convert back
                monthsPaidMap.forEach((value, k) => {
                    (record.monthsPaid as Map<string, IMonthPayment>).set(k, value);
                });
            }
        }

        await record.save();
        revalidatePath('/dashboard/fees/details');
        revalidatePath('/dashboard/fees');
        return { success: true, receiptNumber };
    } catch (error) {
        const err = error as Error;
        return { error: err.message || 'Payment failed' };
    }
}

interface FeePaymentRow {
    transactionId: string;
    feeRecordId: string;
    academicYearId: string;
    branchId: string | null;
    branchName: string;
    receiptNumber: string;
    amount: number;
    paymentMode: string;
    paymentType: string;
    paymentDate: string | undefined;
    monthYear: string;
    feeTerm: string;
    bankName: string;
    chequeNumber: string;
    chequeDate: string;
    payeeName: string;
    notes: string;
    studentId: string;
    studentName: string;
    rollNumber: string;
    className: string;
    section: string;
    shiftName: string;
}

// Electron-parity: Fees page is transaction-first (receipt list), not record-first.
export async function getFeePayments({ academicYearId, branchId = null, search = '' }: FeePaymentsFilters = {}): Promise<FeePaymentRow[]> {
    if (!academicYearId) return [];
    await dbConnect();

    interface FeePaymentsQuery {
        academicYearId: string;
        branchId?: string;
    }

    const query: FeePaymentsQuery = { academicYearId };
    if (branchId) query.branchId = branchId;

    const records = await FeeRecord.find(query as FilterQuery<IFeeRecordDocument>)
        .populate('studentId', 'firstName lastName parentContact1 parentContact2')
        .populate('enrollmentId', 'class section rollNumber shiftName')
        .populate('branchId', 'name')
        .lean();

    interface FeeRecordLean {
        _id: Types.ObjectId;
        academicYearId?: Types.ObjectId;
        branchId?: PopulatedBranch | Types.ObjectId;
        studentId?: PopulatedStudent;
        enrollmentId?: PopulatedEnrollment;
        transactions?: ITransaction[];
    }

    const rows: FeePaymentRow[] = [];
    for (const r of records as unknown as FeeRecordLean[]) {
        const student = r.studentId;
        const enrollment = r.enrollmentId;
        for (const tx of r.transactions || []) {
            rows.push({
                transactionId: idToString((tx as { _id?: Types.ObjectId })._id) || '',
                feeRecordId: idToString(r._id) || '',
                academicYearId: idToString(r.academicYearId) || '',
                branchId: idToString(r.branchId),
                branchName: pickRefName(r.branchId as PopulatedBranch) || '',
                receiptNumber: tx.receiptNumber || '',
                amount: Number(tx.amount) || 0,
                paymentMode: tx.paymentMode || '',
                paymentType: String(tx.paymentMode || '').toLowerCase().includes('cash') ? 'cash' : 'bank',
                paymentDate: dateToISOString(tx.date, { dateOnly: true }),
                monthYear: tx.monthYear || '',
                feeTerm: tx.feeTerm || '',
                bankName: tx.bankName || '',
                chequeNumber: tx.chequeNumber || '',
                chequeDate: dateToISOString(tx.chequeDate, { dateOnly: true }) || '',
                payeeName: tx.payeeName || '',
                notes: tx.remarks || '',
                studentId: idToString(student?._id) || '',
                studentName: `${student?.firstName || ''} ${student?.lastName || ''}`.trim(),
                rollNumber: enrollment?.rollNumber || '',
                className: enrollment?.class || '',
                section: enrollment?.section || '',
                shiftName: enrollment?.shiftName || '',
            });
        }
    }

    const q = String(search || '').trim().toLowerCase();
    const filtered = q
        ? rows.filter((r) => (
            String(r.receiptNumber).toLowerCase().includes(q) ||
            String(r.studentName).toLowerCase().includes(q) ||
            String(r.rollNumber).toLowerCase().includes(q) ||
            String(r.className).toLowerCase().includes(q)
        ))
        : rows;

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
    const feeTerm = ((formData.get('feeTerm') as string | null) || 'term1').trim();
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
    const record = await FeeRecord.findOne({ academicYearId, studentId }) as IFeeRecordDocument | null;
    if (!record) return { error: 'Fee Record not found' };

    const receiptNumber = await generateReceiptNumber(paymentMode);
    const txDate = new Date(paymentDate);
    const breakdown = feeTermToBreakdown(feeTerm, amount);

    const transaction: Partial<ITransaction> = {
        receiptNumber: normalizeReceiptNumber(receiptNumber) || undefined,
        date: txDate,
        amount,
        paymentMode,
        remarks: notes || undefined,
        breakdown,
        monthYear,
        feeTerm,
    };

    if (paymentType === 'bank') {
        transaction.bankName = bankName || undefined;
        transaction.chequeNumber = chequeNumber || undefined;
        transaction.chequeDate = chequeDate ? new Date(chequeDate) : undefined;
        transaction.payeeName = payeeName || undefined;
    }

    if (paymentType === 'upi') {
        transaction.upiId = upiId || undefined;
        transaction.upiReference = upiReference || undefined;
        transaction.payeeName = payeeName || undefined;
    }

    record.transactions.push(transaction as ITransaction);

    const paid = recomputePaidFromTransactions(record.transactions);
    record.fees.term1.paid = paid.term1;
    record.fees.term2.paid = paid.term2;
    record.fees.bookFee.paid = paid.bookFee;
    recomputeStatuses(record.fees);

    // Recompute months paid
    const monthsPaidMap = new Map<string, MonthPaymentStatus>();
    recomputeMonthsPaidFromTransactions(monthsPaidMap, record.transactions);
    record.monthsPaid.clear();
    monthsPaidMap.forEach((value, k) => {
        record.monthsPaid.set(k, value);
    });

    await record.save();
    revalidatePath('/dashboard/fees');
    revalidatePath('/dashboard/fees/details');
    return { success: true, receiptNumber };
}

export async function updateFeePayment(transactionId: string, formData: FormData): Promise<ActionResult> {
    if (!transactionId) return { error: 'Transaction is required' };
    await dbConnect();

    const record = await FeeRecord.findOne({ 'transactions._id': transactionId }) as IFeeRecordDocument | null;
    if (!record) return { error: 'Transaction not found' };

    const tx = (record.transactions as unknown as { id(id: string): ITransaction | null }).id(transactionId);
    if (!tx) return { error: 'Transaction not found' };

    const amount = parseFloat((formData.get('amount') as string | null) || String(tx.amount || '0'));
    const paymentType = ((formData.get('paymentType') as string | null) || '').trim().toLowerCase();
    const paymentMode: PaymentMode = paymentType === 'cash' ? 'Cash' : paymentType === 'upi' ? 'UPI' : paymentType === 'bank' ? 'Bank Transfer' : tx.paymentMode;
    const monthYear = ((formData.get('monthYear') as string | null) || tx.monthYear || '').trim();
    const paymentDate = ((formData.get('paymentDate') as string | null) || '').trim();
    const feeTerm = ((formData.get('feeTerm') as string | null) || tx.feeTerm || 'term1').trim();
    const notes = ((formData.get('notes') as string | null) || '');

    const bankName = ((formData.get('bankName') as string | null) || '').trim();
    const chequeNumber = ((formData.get('chequeNumber') as string | null) || '').trim();
    const chequeDate = ((formData.get('chequeDate') as string | null) || '').trim();
    const payeeName = ((formData.get('payeeName') as string | null) || '').trim();

    const upiId = ((formData.get('upiId') as string | null) || '').trim();
    const upiReference = ((formData.get('upiReference') as string | null) || '').trim();

    if (!monthYear) return { error: 'Upto Month is required' };
    if (!paymentDate) return { error: 'Payment Date is required' };
    if (!amount || amount <= 0) return { error: 'Valid amount is required' };
    if (paymentType === 'bank' && !payeeName) return { error: 'Payee name is required for bank payments' };

    tx.amount = amount;
    tx.paymentMode = paymentMode;
    tx.monthYear = monthYear;
    tx.date = new Date(paymentDate);
    tx.feeTerm = feeTerm;
    tx.remarks = notes || '';
    tx.breakdown = feeTermToBreakdown(feeTerm, amount);

    if (paymentType === 'bank') {
        tx.bankName = bankName || '';
        tx.chequeNumber = chequeNumber || '';
        tx.chequeDate = chequeDate ? new Date(chequeDate) : undefined;
        tx.payeeName = payeeName || '';
        tx.upiId = undefined;
        tx.upiReference = undefined;
    } else if (paymentType === 'upi') {
        tx.upiId = upiId || '';
        tx.upiReference = upiReference || '';
        tx.payeeName = payeeName || '';
        tx.bankName = undefined;
        tx.chequeNumber = undefined;
        tx.chequeDate = undefined;
    } else if (paymentType === 'cash') {
        tx.bankName = '';
        tx.chequeNumber = '';
        tx.chequeDate = undefined;
        tx.payeeName = '';
        tx.upiId = undefined;
        tx.upiReference = undefined;
    }

    const paid = recomputePaidFromTransactions(record.transactions);
    record.fees.term1.paid = paid.term1;
    record.fees.term2.paid = paid.term2;
    record.fees.bookFee.paid = paid.bookFee;
    recomputeStatuses(record.fees);

    const monthsPaidMap = new Map<string, MonthPaymentStatus>();
    recomputeMonthsPaidFromTransactions(monthsPaidMap, record.transactions);
    record.monthsPaid.clear();
    monthsPaidMap.forEach((value, k) => {
        record.monthsPaid.set(k, value);
    });

    await record.save();
    revalidatePath('/dashboard/fees');
    revalidatePath('/dashboard/fees/details');
    return { success: true };
}

export async function deleteFeePayment(transactionId: string): Promise<ActionResult> {
    if (!transactionId) return { error: 'Transaction is required' };
    await dbConnect();

    const record = await FeeRecord.findOne({ 'transactions._id': transactionId }) as IFeeRecordDocument | null;
    if (!record) return { error: 'Transaction not found' };

    (record.transactions as unknown as { pull(obj: { _id: string }): void }).pull({ _id: transactionId });

    const paid = recomputePaidFromTransactions(record.transactions);
    record.fees.term1.paid = paid.term1;
    record.fees.term2.paid = paid.term2;
    record.fees.bookFee.paid = paid.bookFee;
    recomputeStatuses(record.fees);

    const monthsPaidMap = new Map<string, MonthPaymentStatus>();
    recomputeMonthsPaidFromTransactions(monthsPaidMap, record.transactions);
    record.monthsPaid.clear();
    monthsPaidMap.forEach((value, k) => {
        record.monthsPaid.set(k, value);
    });

    await record.save();
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

// Get fee collection stats for dashboard
export async function getFeeStats(academicYearId: string | null, branchId: string | null = null): Promise<FeeStats> {
    await dbConnect();

    interface StatsQuery {
        academicYearId?: string;
        branchId?: string;
    }

    const query: StatsQuery = {};
    if (academicYearId) query.academicYearId = academicYearId;
    if (branchId) query.branchId = branchId;

    const records = await FeeRecord.find(query as FilterQuery<IFeeRecordDocument>).lean();

    let totalDue = 0;
    let totalCollected = 0;
    let todayCollection = 0;
    let monthCollection = 0;

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    interface FeeRecordLean {
        fees?: FeeHeads;
        transactions?: Array<{ date?: Date; amount?: number }>;
    }

    for (const record of records as unknown as FeeRecordLean[]) {
        totalDue += (record.fees?.term1?.amount || 0) + (record.fees?.term2?.amount || 0) + (record.fees?.bookFee?.amount || 0);
        totalCollected += (record.fees?.term1?.paid || 0) + (record.fees?.term2?.paid || 0) + (record.fees?.bookFee?.paid || 0);

        for (const tx of record.transactions || []) {
            const txDate = new Date(tx.date || 0);
            if (txDate >= startOfDay) {
                todayCollection += tx.amount || 0;
            }
            if (txDate >= startOfMonth) {
                monthCollection += tx.amount || 0;
            }
        }
    }

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

    interface TransactionsQuery {
        branchId?: string;
    }

    const query: TransactionsQuery = {};
    if (branchId) query.branchId = branchId;

    const records = await FeeRecord.find(query as FilterQuery<IFeeRecordDocument>)
        .populate('studentId', 'firstName lastName admissionNumber')
        .lean();

    interface FeeRecordLean {
        studentId?: PopulatedStudent;
        transactions?: ITransaction[];
    }

    // Flatten and sort all transactions
    const allTransactions: RecentTransaction[] = [];
    for (const record of records as unknown as FeeRecordLean[]) {
        for (const tx of record.transactions || []) {
            allTransactions.push({
                ...tx,
                _id: idToString((tx as { _id?: Types.ObjectId })._id) || '',
                date: dateToISOString(tx?.date),
                studentName: `${record.studentId?.firstName || ''} ${record.studentId?.lastName || ''}`.trim(),
                admissionNumber: record.studentId?.admissionNumber,
            });
        }
    }

    // Sort by date descending and limit
    allTransactions.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    return allTransactions.slice(0, limit);
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

// Electron parity helpers: term summary + month status for a student (used in Fees UI/reporting).
export async function getStudentTermSummary(studentId: string, academicYearId: string | null = null): Promise<TermSummaryResult> {
    if (!studentId) return { success: false, error: 'Student is required' };
    await dbConnect();

    interface SummaryQuery {
        studentId: string;
        academicYearId?: string;
    }

    const query: SummaryQuery = academicYearId ? { studentId, academicYearId } : { studentId };
    const record = await FeeRecord.findOne(query as FilterQuery<IFeeRecordDocument>).lean();
    if (!record) return { success: false, error: 'Fee record not found' };

    interface FeeRecordLean {
        fees?: FeeHeads;
    }

    const r = record as unknown as FeeRecordLean;

    const term1Total = Number(r?.fees?.term1?.amount) || 0;
    const term1Paid = Number(r?.fees?.term1?.paid) || 0;
    const term2Total = Number(r?.fees?.term2?.amount) || 0;
    const term2Paid = Number(r?.fees?.term2?.paid) || 0;
    const booksTotal = Number(r?.fees?.bookFee?.amount) || 0;
    const booksPaid = Number(r?.fees?.bookFee?.paid) || 0;

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

    const record = await FeeRecord.findOne({ studentId, academicYearId }, { monthsPaid: 1 }).lean();
    if (!record) return { success: false, error: 'Fee record not found' };

    interface FeeRecordLean {
        monthsPaid?: Record<string, { amount?: number; paidDate?: Date; status?: string }>;
    }

    const r = record as unknown as FeeRecordLean;

    const monthsStatus: Record<string, MonthStatus> = {};
    const raw = r?.monthsPaid;

    // Mongoose Map is returned as a plain object from .lean()
    if (raw && typeof raw === 'object') {
        for (const [month, status] of Object.entries(raw)) {
            const amount = Number(status?.amount) || 0;
            const paidDate = status?.paidDate ? dateToISOString(status.paidDate, { dateOnly: true }) : null;
            monthsStatus[month] = {
                paid: true,
                amount,
                paid_date: paidDate || null,
                status: status?.status || 'paid',
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

// Electron parity: Fee report by class/division for the selected branch/year.
export async function getFeeReportRows({
    academicYearId,
    branchId,
    className = null,
    shiftName = null,
    section = null,
}: FeeReportFilters = {}): Promise<FeeReportRow[]> {
    if (!academicYearId || !branchId) return [];
    await dbConnect();

    interface EnrollmentQuery {
        academicYearId: string;
        status: string;
        class?: string;
        shiftName?: string;
        section?: string;
    }

    const enrollmentQuery: EnrollmentQuery = { academicYearId, status: 'Active' };
    if (className) enrollmentQuery.class = className;
    if (typeof shiftName === 'string') enrollmentQuery.shiftName = shiftName;
    if (section) enrollmentQuery.section = String(section).trim().toUpperCase();

    const enrollments = await StudentEnrollment.find(enrollmentQuery)
        .populate({
            path: 'studentId',
            match: { isActive: true, branchId },
            select: 'firstName lastName admissionNumber',
        })
        .sort({ class: 1, section: 1, rollNumber: 1 })
        .lean();

    interface EnrollmentLean {
        _id: Types.ObjectId;
        studentId: PopulatedStudent | null;
        class?: string;
        section?: string;
        shiftName?: string;
        rollNumber?: string;
    }

    const filtered = ((enrollments || []) as unknown as EnrollmentLean[]).filter((e) => e.studentId);
    const studentIds = filtered.map((e) => e.studentId!._id);

    const records = await FeeRecord.find({ academicYearId, studentId: { $in: studentIds } }, { studentId: 1, fees: 1 }).lean();

    interface FeeRecordLean {
        studentId?: Types.ObjectId;
        fees?: FeeHeads;
    }

    const recordByStudent = new Map((records as unknown as FeeRecordLean[]).map((r) => [String(r.studentId), r]));

    return filtered.map((e) => {
        const s = e.studentId!;
        const fr = recordByStudent.get(String(s._id));
        const term1Total = Number(fr?.fees?.term1?.amount) || 0;
        const term1Paid = Number(fr?.fees?.term1?.paid) || 0;
        const term2Total = Number(fr?.fees?.term2?.amount) || 0;
        const term2Paid = Number(fr?.fees?.term2?.paid) || 0;
        const booksTotal = Number(fr?.fees?.bookFee?.amount) || 0;
        const booksPaid = Number(fr?.fees?.bookFee?.paid) || 0;

        return {
            _id: idToString(s._id) || '',
            name: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
            rollNumber: e.rollNumber || '',
            className: e.class || '',
            shiftName: e.shiftName || '',
            section: e.section || '',
            termSummary: {
                terms: {
                    term1: { total: term1Total, paid: term1Paid, pending: Math.max(0, term1Total - term1Paid) },
                    term2: { total: term2Total, paid: term2Paid, pending: Math.max(0, term2Total - term2Paid) },
                    books: { total: booksTotal, paid: booksPaid, pending: Math.max(0, booksTotal - booksPaid) },
                },
            },
        };
    });
}
