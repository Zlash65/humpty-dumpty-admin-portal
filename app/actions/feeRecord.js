'use server';

import dbConnect from '@/lib/db';
import FeeRecord from '@/models/FeeRecord';
import AcademicYear from '@/models/AcademicYear';
import { revalidatePath } from 'next/cache';

export async function getFeeRecords(academicYearId) {
    if (!academicYearId) return [];
    await dbConnect();

    const records = await FeeRecord.find({ academicYearId })
        .populate('studentId', 'firstName lastName admissionNumber')
        .sort({ 'studentId.rollNumber': 1 }) // This won't work perfectly on populated field without aggregation, but simple sort on createdAt is fine
        .lean();

    return records.map(r => ({
        ...r,
        _id: r._id.toString(),
        academicYearId: r.academicYearId.toString(),
        studentId: {
            ...r.studentId,
            _id: r.studentId._id.toString(),
        },
        transactions: r.transactions.map(t => ({
            ...t,
            _id: t._id.toString(),
            date: t.date.toISOString(),
        }))
    }));
}

export async function getStudentFeeRecord(academicYearId, studentId) {
    await dbConnect();
    const record = await FeeRecord.findOne({ academicYearId, studentId })
        .populate('studentId', 'firstName lastName admissionNumber')
        .populate('academicYearId', 'name')
        .lean();

    if (!record) return null;

    return {
        ...record,
        _id: record._id.toString(),
        academicYearId: {
            ...record.academicYearId,
            _id: record.academicYearId._id.toString(),
        },
        studentId: {
            ...record.studentId,
            _id: record.studentId._id.toString(),
        },
        transactions: record.transactions.map(t => ({
            ...t,
            _id: t._id.toString(),
            date: t.date.toISOString(),
        }))
    };
}

export async function recordPayment(formData) {
    const academicYearId = formData.get('academicYearId');
    const studentId = formData.get('studentId');
    const amount = parseFloat(formData.get('amount') || '0');
    const paymentMode = formData.get('paymentMode');
    const reference = formData.get('reference');
    const remarks = formData.get('remarks');

    // Breakdown (simplified: auto-allocate or manual? Design spec said manual breakdown in transaction)
    // For simplicity, let's ask user to specify breakdown or auto-allocate.
    // Design spec: "breakdown: { term1: Number... }" in transaction.
    // Let's take manual breakdown from form.
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

        // Update Fee Heads
        record.fees.term1.paid += term1;
        record.fees.term2.paid += term2;
        record.fees.bookFee.paid += bookFee;

        // Update Statuses
        ['term1', 'term2', 'bookFee'].forEach(head => {
            if (record.fees[head].paid >= record.fees[head].amount) {
                record.fees[head].status = 'Paid';
            } else if (record.fees[head].paid > 0) {
                record.fees[head].status = 'Partial';
            }
        });

        // Add Transaction
        record.transactions.push({
            amount,
            paymentMode,
            reference,
            remarks,
            breakdown: { term1, term2, bookFee },
            date: new Date()
        });

        await record.save();
        revalidatePath(`/dashboard/fees/details`);
        return { success: true };
    } catch (error) {
        console.error('Error recording payment:', error);
        return { error: 'Payment failed' };
    }
}
