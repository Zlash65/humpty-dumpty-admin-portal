'use server';

import dbConnect from '@/lib/db';
import { dateToISOString, idToString, pickRefName } from '@/lib/serialize';
import FeeRecord from '@/models/FeeRecord';
import ReceiptSequence from '@/models/ReceiptSequence';
import StudentEnrollment from '@/models/StudentEnrollment';
import { revalidatePath } from 'next/cache';

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

function normalizeReceiptNumber(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    const m = s.match(/^([cCbB])[- ]?(\d+)$/);
    if (m) {
        return `${m[1].toUpperCase()}-${m[2]}`;
    }
    return s;
}

async function getCurrentMaxReceiptNumber(prefix) {
    const re = new RegExp(`^${prefix}[- ]?\\d+$`, 'i');
    const records = await FeeRecord.find(
        { 'transactions.receiptNumber': { $regex: re } },
        { 'transactions.receiptNumber': 1 }
    ).lean();

    let max = 0;
    for (const r of records) {
        for (const tx of r.transactions || []) {
            const rn = String(tx?.receiptNumber || '');
            const m = rn.match(/(\d+)$/);
            if (!m) continue;
            const n = parseInt(m[1], 10);
            if (Number.isFinite(n) && n > max) max = n;
        }
    }
    return max;
}

async function ensureReceiptSequence(prefix) {
    await dbConnect();

    const existing = await ReceiptSequence.findOne({ prefix }).lean();
    if (existing) return;

    const maxExisting = await getCurrentMaxReceiptNumber(prefix);
    try {
        await ReceiptSequence.create({ prefix, lastNumber: maxExisting });
    } catch (e) {
        // concurrent init is fine
        if (e?.code !== 11000) throw e;
    }
}

async function generateReceiptNumber(paymentMode) {
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

export async function previewNextReceiptNumber(paymentType = 'cash') {
    await dbConnect();
    const normalized = String(paymentType || 'cash').toLowerCase();
    const paymentMode = normalized === 'cash' ? 'Cash' : 'Bank Transfer';
    const prefix = paymentMode === 'Cash' ? 'C' : 'B';
    await ensureReceiptSequence(prefix);
    const seq = await ReceiptSequence.findOne({ prefix }).lean();
    const next = (seq?.lastNumber || 0) + 1;
    return `${prefix}-${next}`;
}

function normalizeMonthKey(input) {
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

function updateMonthsPaidSequential(monthsPaidMap, monthName, amount, paidDate = new Date()) {
    const idx = MONTHS.indexOf(monthName);

    // Fallback: store raw key without sequential assumptions
    if (idx === -1) {
        const current = monthsPaidMap.get(monthName) || {};
        monthsPaidMap.set(monthName, {
            amount: (Number(current.amount) || 0) + (Number(amount) || 0),
            paidDate,
            status: 'paid',
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
            status: 'paid',
        });
    }
}

function recomputePaidFromTransactions(transactions = []) {
    const paid = { term1: 0, term2: 0, bookFee: 0 };
    for (const tx of transactions) {
        paid.term1 += Number(tx?.breakdown?.term1) || 0;
        paid.term2 += Number(tx?.breakdown?.term2) || 0;
        paid.bookFee += Number(tx?.breakdown?.bookFee) || 0;
    }
    return paid;
}

function recomputeStatuses(fees) {
    for (const head of ['term1', 'term2', 'bookFee']) {
        const amount = Number(fees?.[head]?.amount) || 0;
        const paid = Number(fees?.[head]?.paid) || 0;
        fees[head].status = amount <= 0 ? 'Paid' : paid >= amount ? 'Paid' : paid > 0 ? 'Partial' : 'Pending';
    }
}

function recomputeMonthsPaidFromTransactions(monthsPaidMap, transactions = []) {
    monthsPaidMap.clear();
    const sorted = [...(transactions || [])].sort(
        (a, b) => new Date(a?.date).getTime() - new Date(b?.date).getTime()
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

function serializeTransactions(transactions) {
    return (transactions || []).map((t) => ({
        ...t,
        _id: idToString(t?._id),
        date: dateToISOString(t?.date),
        chequeDate: dateToISOString(t?.chequeDate) || null,
    }));
}

function feeTermToBreakdown(feeTermRaw, amount) {
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

export async function getFeeRecords(academicYearId) {
    if (!academicYearId) return [];
    await dbConnect();

    const records = await FeeRecord.find({ academicYearId })
        .populate('studentId', 'firstName lastName admissionNumber parentContact1')
        .populate('branchId', 'name')
        .sort({ createdAt: -1 })
        .lean();

    return records.map(r => ({
        ...r,
        _id: idToString(r._id),
        academicYearId: idToString(r.academicYearId),
        branchId: idToString(r.branchId),
        branchName: pickRefName(r.branchId),
        studentId: {
            ...r.studentId,
            _id: idToString(r.studentId?._id),
        },
        enrollmentId: idToString(r.enrollmentId),
        transactions: serializeTransactions(r.transactions),
        // Computed fields
        totalDue: (r.fees?.term1?.amount || 0) + (r.fees?.term2?.amount || 0) + (r.fees?.bookFee?.amount || 0),
        totalPaid: (r.fees?.term1?.paid || 0) + (r.fees?.term2?.paid || 0) + (r.fees?.bookFee?.paid || 0),
    }));
}

export async function getStudentFeeRecord(academicYearId, studentId) {
    await dbConnect();
    const record = await FeeRecord.findOne({ academicYearId, studentId })
        .populate('studentId', 'firstName lastName admissionNumber fatherName motherName parentContact1 parentContact2')
        .populate('academicYearId', 'name')
        .populate('branchId', 'name')
        .populate('enrollmentId', 'class section rollNumber shiftName')
        .lean();

    if (!record) return null;

    const enrollment = record.enrollmentId && typeof record.enrollmentId === 'object'
        ? record.enrollmentId
        : null;

    return {
        ...record,
        _id: idToString(record._id),
        academicYearId: {
            ...record.academicYearId,
            _id: idToString(record.academicYearId?._id),
        },
        branchId: idToString(record.branchId),
        branchName: pickRefName(record.branchId),
        studentId: {
            ...record.studentId,
            _id: idToString(record.studentId?._id),
        },
        enrollmentId: idToString(enrollment || record.enrollmentId),
        enrollment: enrollment
            ? {
                _id: idToString(enrollment._id),
                class: enrollment.class || '',
                section: enrollment.section || '',
                rollNumber: enrollment.rollNumber || '',
                shiftName: enrollment.shiftName || '',
            }
            : null,
        transactions: serializeTransactions(record.transactions),
        totalDue: (record.fees?.term1?.amount || 0) + (record.fees?.term2?.amount || 0) + (record.fees?.bookFee?.amount || 0),
        totalPaid: (record.fees?.term1?.paid || 0) + (record.fees?.term2?.paid || 0) + (record.fees?.bookFee?.paid || 0),
    };
}

export async function recordPayment(formData) {
    const academicYearId = formData.get('academicYearId');
    const studentId = formData.get('studentId');
    const amount = parseFloat(formData.get('amount') || '0');
    const paymentMode = formData.get('paymentMode');
    const reference = formData.get('reference');
    const remarks = formData.get('remarks');

    // Cheque/Bank details
    const chequeNumber = formData.get('chequeNumber') || undefined;
    const chequeDate = formData.get('chequeDate') || undefined;
    const bankName = formData.get('bankName') || undefined;
    const payeeName = formData.get('payeeName') || undefined;

    // UPI details
    const upiId = formData.get('upiId') || undefined;
    const upiReference = formData.get('upiReference') || undefined;

    // For monthly tracking
    const monthYear = formData.get('monthYear') || undefined;
    const paymentDate = formData.get('paymentDate') || undefined;
    const feeTerm = (formData.get('feeTerm') || '').toString().trim();

    // Breakdown
    const term1 = parseFloat(formData.get('breakdownTerm1') || '0');
    const term2 = parseFloat(formData.get('breakdownTerm2') || '0');
    const bookFee = parseFloat(formData.get('breakdownBookFee') || '0');

    if (amount <= 0) return { error: 'Invalid amount' };
    if ((term1 + term2 + bookFee) !== amount) {
        return { error: 'Breakdown totals must match payment amount' };
    }

    try {
        await dbConnect();
        const record = await FeeRecord.findOne({ academicYearId, studentId });
        if (!record) return { error: 'Fee Record not found' };

        const receiptNumber = await generateReceiptNumber(paymentMode);

        record.fees.term1.paid += term1;
        record.fees.term2.paid += term2;
        record.fees.bookFee.paid += bookFee;

        ['term1', 'term2', 'bookFee'].forEach(head => {
            if (record.fees[head].paid >= record.fees[head].amount) {
                record.fees[head].status = 'Paid';
            } else if (record.fees[head].paid > 0) {
                record.fees[head].status = 'Partial';
            }
        });

        const txDate = paymentDate ? new Date(paymentDate) : new Date();
        const transaction = {
            receiptNumber: normalizeReceiptNumber(receiptNumber),
            amount,
            paymentMode,
            reference,
            remarks,
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

        record.transactions.push(transaction);

        // Update monthly tracking if provided
        if (monthYear) {
            const key = normalizeMonthKey(monthYear);
            if (key) updateMonthsPaidSequential(record.monthsPaid, key, amount, txDate);
        }

        await record.save();
        revalidatePath('/dashboard/fees/details');
        revalidatePath('/dashboard/fees');
        return { success: true, receiptNumber };
    } catch (error) {
        return { error: error.message || 'Payment failed' };
    }
}

// Electron-parity: Fees page is transaction-first (receipt list), not record-first.
export async function getFeePayments({ academicYearId, branchId = null, search = '' } = {}) {
    if (!academicYearId) return [];
    await dbConnect();

    const query = { academicYearId };
    if (branchId) query.branchId = branchId;

    const records = await FeeRecord.find(query)
        .populate('studentId', 'firstName lastName parentContact1 parentContact2')
        .populate('enrollmentId', 'class section rollNumber shiftName')
        .populate('branchId', 'name')
        .lean();

    const rows = [];
    for (const r of records) {
        const student = r.studentId || {};
        const enrollment = r.enrollmentId || {};
        for (const tx of r.transactions || []) {
            rows.push({
                transactionId: idToString(tx._id),
                feeRecordId: idToString(r._id),
                academicYearId: idToString(r.academicYearId),
                branchId: idToString(r.branchId),
                branchName: pickRefName(r.branchId) || '',
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
                studentId: idToString(student._id),
                studentName: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
                rollNumber: enrollment.rollNumber || '',
                className: enrollment.class || '',
                section: enrollment.section || '',
                shiftName: enrollment.shiftName || '',
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

    filtered.sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
    return filtered;
}

export async function addFeePayment(formData) {
    const academicYearId = formData.get('academicYearId');
    const studentId = formData.get('studentId');
    const amount = parseFloat(formData.get('amount') || '0');
    const paymentType = (formData.get('paymentType') || 'cash').toString().trim().toLowerCase();
    const paymentMode = paymentType === 'cash' ? 'Cash' : paymentType === 'upi' ? 'UPI' : 'Bank Transfer';

    const monthYear = (formData.get('monthYear') || '').toString().trim();
    const paymentDate = (formData.get('paymentDate') || '').toString().trim();
    const feeTerm = (formData.get('feeTerm') || 'term1').toString().trim();
    const notes = (formData.get('notes') || '').toString();

    const bankName = (formData.get('bankName') || '').toString().trim();
    const chequeNumber = (formData.get('chequeNumber') || '').toString().trim();
    const chequeDate = (formData.get('chequeDate') || '').toString().trim();
    const payeeName = (formData.get('payeeName') || '').toString().trim();

    const upiId = (formData.get('upiId') || '').toString().trim();
    const upiReference = (formData.get('upiReference') || '').toString().trim();

    if (!academicYearId || !studentId) return { error: 'Student and Academic Year are required' };
    if (!monthYear) return { error: 'Upto Month is required' };
    if (!paymentDate) return { error: 'Payment Date is required' };
    if (!amount || amount <= 0) return { error: 'Valid amount is required' };
    if (paymentType === 'bank' && !payeeName) return { error: 'Payee name is required for bank payments' };

    await dbConnect();
    const record = await FeeRecord.findOne({ academicYearId, studentId });
    if (!record) return { error: 'Fee Record not found' };

    const receiptNumber = await generateReceiptNumber(paymentMode);
    const txDate = new Date(paymentDate);
    const breakdown = feeTermToBreakdown(feeTerm, amount);

    const transaction = {
        receiptNumber: normalizeReceiptNumber(receiptNumber),
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

    record.transactions.push(transaction);

    const paid = recomputePaidFromTransactions(record.transactions);
    record.fees.term1.paid = paid.term1;
    record.fees.term2.paid = paid.term2;
    record.fees.bookFee.paid = paid.bookFee;
    recomputeStatuses(record.fees);

    recomputeMonthsPaidFromTransactions(record.monthsPaid, record.transactions);

    await record.save();
    revalidatePath('/dashboard/fees');
    revalidatePath('/dashboard/fees/details');
    return { success: true, receiptNumber };
}

export async function updateFeePayment(transactionId, formData) {
    if (!transactionId) return { error: 'Transaction is required' };
    await dbConnect();

    const record = await FeeRecord.findOne({ 'transactions._id': transactionId });
    if (!record) return { error: 'Transaction not found' };

    const tx = record.transactions.id(transactionId);
    if (!tx) return { error: 'Transaction not found' };

    const amount = parseFloat(formData.get('amount') || String(tx.amount || '0'));
    const paymentType = (formData.get('paymentType') || '').toString().trim().toLowerCase();
    const paymentMode = paymentType === 'cash' ? 'Cash' : paymentType === 'upi' ? 'UPI' : paymentType === 'bank' ? 'Bank Transfer' : tx.paymentMode;
    const monthYear = (formData.get('monthYear') || tx.monthYear || '').toString().trim();
    const paymentDate = (formData.get('paymentDate') || '').toString().trim();
    const feeTerm = (formData.get('feeTerm') || tx.feeTerm || 'term1').toString().trim();
    const notes = (formData.get('notes') || '').toString();

    const bankName = (formData.get('bankName') || '').toString().trim();
    const chequeNumber = (formData.get('chequeNumber') || '').toString().trim();
    const chequeDate = (formData.get('chequeDate') || '').toString().trim();
    const payeeName = (formData.get('payeeName') || '').toString().trim();

    const upiId = (formData.get('upiId') || '').toString().trim();
    const upiReference = (formData.get('upiReference') || '').toString().trim();

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
        tx.chequeDate = chequeDate ? new Date(chequeDate) : null;
        tx.payeeName = payeeName || '';
        tx.upiId = undefined;
        tx.upiReference = undefined;
    } else if (paymentType === 'upi') {
        tx.upiId = upiId || '';
        tx.upiReference = upiReference || '';
        tx.payeeName = payeeName || '';
        tx.bankName = undefined;
        tx.chequeNumber = undefined;
        tx.chequeDate = null;
    } else if (paymentType === 'cash') {
        tx.bankName = '';
        tx.chequeNumber = '';
        tx.chequeDate = null;
        tx.payeeName = '';
        tx.upiId = undefined;
        tx.upiReference = undefined;
    }

    const paid = recomputePaidFromTransactions(record.transactions);
    record.fees.term1.paid = paid.term1;
    record.fees.term2.paid = paid.term2;
    record.fees.bookFee.paid = paid.bookFee;
    recomputeStatuses(record.fees);
    recomputeMonthsPaidFromTransactions(record.monthsPaid, record.transactions);

    await record.save();
    revalidatePath('/dashboard/fees');
    revalidatePath('/dashboard/fees/details');
    return { success: true };
}

export async function deleteFeePayment(transactionId) {
    if (!transactionId) return { error: 'Transaction is required' };
    await dbConnect();

    const record = await FeeRecord.findOne({ 'transactions._id': transactionId });
    if (!record) return { error: 'Transaction not found' };

    record.transactions.pull({ _id: transactionId });

    const paid = recomputePaidFromTransactions(record.transactions);
    record.fees.term1.paid = paid.term1;
    record.fees.term2.paid = paid.term2;
    record.fees.bookFee.paid = paid.bookFee;
    recomputeStatuses(record.fees);
    recomputeMonthsPaidFromTransactions(record.monthsPaid, record.transactions);

    await record.save();
    revalidatePath('/dashboard/fees');
    revalidatePath('/dashboard/fees/details');
    return { success: true };
}

// Get fee collection stats for dashboard
export async function getFeeStats(academicYearId, branchId = null) {
    await dbConnect();

    const query = {};
    if (academicYearId) query.academicYearId = academicYearId;
    if (branchId) query.branchId = branchId;

    const records = await FeeRecord.find(query).lean();

    let totalDue = 0;
    let totalCollected = 0;
    let todayCollection = 0;
    let monthCollection = 0;

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    for (const record of records) {
        totalDue += (record.fees?.term1?.amount || 0) + (record.fees?.term2?.amount || 0) + (record.fees?.bookFee?.amount || 0);
        totalCollected += (record.fees?.term1?.paid || 0) + (record.fees?.term2?.paid || 0) + (record.fees?.bookFee?.paid || 0);

        for (const tx of record.transactions || []) {
            const txDate = new Date(tx.date);
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

export async function getRecentTransactions(limit = 5, branchId = null) {
    await dbConnect();

    const query = {};
    if (branchId) query.branchId = branchId;

    const records = await FeeRecord.find(query)
        .populate('studentId', 'firstName lastName admissionNumber')
        .lean();

    // Flatten and sort all transactions
    const allTransactions = [];
    for (const record of records) {
        for (const tx of record.transactions || []) {
            allTransactions.push({
                ...tx,
                _id: idToString(tx?._id),
                date: dateToISOString(tx?.date),
                studentName: `${record.studentId?.firstName || ''} ${record.studentId?.lastName || ''}`.trim(),
                admissionNumber: record.studentId?.admissionNumber,
            });
        }
    }

    // Sort by date descending and limit
    allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    return allTransactions.slice(0, limit);
}

// Electron parity helpers: term summary + month status for a student (used in Fees UI/reporting).
export async function getStudentTermSummary(studentId, academicYearId = null) {
    if (!studentId) return { success: false, error: 'Student is required' };
    await dbConnect();

    const query = academicYearId ? { studentId, academicYearId } : { studentId };
    const record = await FeeRecord.findOne(query).lean();
    if (!record) return { success: false, error: 'Fee record not found' };

    const term1Total = Number(record?.fees?.term1?.amount) || 0;
    const term1Paid = Number(record?.fees?.term1?.paid) || 0;
    const term2Total = Number(record?.fees?.term2?.amount) || 0;
    const term2Paid = Number(record?.fees?.term2?.paid) || 0;
    const booksTotal = Number(record?.fees?.bookFee?.amount) || 0;
    const booksPaid = Number(record?.fees?.bookFee?.paid) || 0;

    const summary = {
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

export async function getStudentMonthsStatus(studentId, academicYearId) {
    if (!studentId || !academicYearId) return { success: false, error: 'Student and Academic Year are required' };
    await dbConnect();

    const record = await FeeRecord.findOne({ studentId, academicYearId }, { monthsPaid: 1 }).lean();
    if (!record) return { success: false, error: 'Fee record not found' };

    const monthsStatus = {};
    const raw = record?.monthsPaid;

    // Mongoose Map is returned as a plain object from .lean()
    if (raw && typeof raw === 'object') {
        for (const [month, status] of Object.entries(raw)) {
            const amount = Number(status?.amount) || 0;
            const paidDate = status?.paidDate ? dateToISOString(status.paidDate, { dateOnly: true }) : null;
            monthsStatus[month] = {
                paid: true,
                amount,
                paid_date: paidDate,
                status: status?.status || 'paid',
            };
        }
    }

    return { success: true, monthsStatus };
}

// Electron parity: Fee report by class/division for the selected branch/year.
export async function getFeeReportRows({
    academicYearId,
    branchId,
    className = null,
    shiftName = null,
    section = null,
} = {}) {
    if (!academicYearId || !branchId) return [];
    await dbConnect();

    const enrollmentQuery = { academicYearId, status: 'Active' };
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

    const filtered = (enrollments || []).filter((e) => e.studentId);
    const studentIds = filtered.map((e) => e.studentId._id);

    const records = await FeeRecord.find({ academicYearId, studentId: { $in: studentIds } }, { studentId: 1, fees: 1 }).lean();
    const recordByStudent = new Map(records.map((r) => [String(r.studentId), r]));

    return filtered.map((e) => {
        const s = e.studentId;
        const fr = recordByStudent.get(String(s._id));
        const term1Total = Number(fr?.fees?.term1?.amount) || 0;
        const term1Paid = Number(fr?.fees?.term1?.paid) || 0;
        const term2Total = Number(fr?.fees?.term2?.amount) || 0;
        const term2Paid = Number(fr?.fees?.term2?.paid) || 0;
        const booksTotal = Number(fr?.fees?.bookFee?.amount) || 0;
        const booksPaid = Number(fr?.fees?.bookFee?.paid) || 0;

        return {
            _id: idToString(s._id),
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
