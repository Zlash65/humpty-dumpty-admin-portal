'use server';

import dbConnect from '@/lib/db';
import { dateToISOString, idToString, pickRefName } from '@/lib/serialize';
import FeeRecord from '@/models/FeeRecord';
import ReceiptSequence from '@/models/ReceiptSequence';
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

function updateMonthsPaidSequential(monthsPaidMap, monthName, amount) {
    const idx = MONTHS.indexOf(monthName);
    const now = new Date();

    // Fallback: store raw key without sequential assumptions
    if (idx === -1) {
        const current = monthsPaidMap.get(monthName) || {};
        monthsPaidMap.set(monthName, {
            amount: (Number(current.amount) || 0) + (Number(amount) || 0),
            paidDate: now,
            status: 'paid',
        });
        return;
    }

    for (let i = 0; i <= idx; i++) {
        const key = MONTHS[i];
        const current = monthsPaidMap.get(key) || {};
        const isTarget = i === idx;
        monthsPaidMap.set(key, {
            amount: isTarget ? (Number(current.amount) || 0) + (Number(amount) || 0) : (Number(current.amount) || 0),
            paidDate: now,
            status: 'paid',
        });
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
        .lean();

    if (!record) return null;

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
        enrollmentId: idToString(record.enrollmentId),
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

    // For monthly tracking
    const monthYear = formData.get('monthYear') || undefined;

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

        const transaction = {
            receiptNumber: normalizeReceiptNumber(receiptNumber),
            amount,
            paymentMode,
            reference,
            remarks,
            breakdown: { term1, term2, bookFee },
            date: new Date(),
            monthYear,
        };

        if (paymentMode === 'Cheque' || paymentMode === 'Bank Transfer') {
            if (chequeNumber) transaction.chequeNumber = chequeNumber;
            if (chequeDate) transaction.chequeDate = new Date(chequeDate);
            if (bankName) transaction.bankName = bankName;
            if (payeeName) transaction.payeeName = payeeName;
        }

        record.transactions.push(transaction);

        // Update monthly tracking if provided
        if (monthYear) {
            const key = normalizeMonthKey(monthYear);
            if (key) updateMonthsPaidSequential(record.monthsPaid, key, amount);
        }

        await record.save();
        revalidatePath('/dashboard/fees/details');
        revalidatePath('/dashboard/fees');
        return { success: true, receiptNumber };
    } catch (error) {
        console.error('Error recording payment:', error);
        return { error: error.message || 'Payment failed' };
    }
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
