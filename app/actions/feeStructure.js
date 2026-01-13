'use server';

import dbConnect from '@/lib/db';
import FeeStructure from '@/models/FeeStructure';
import { revalidatePath } from 'next/cache';

export async function createFeeStructure(formData) {
    const academicYearId = formData.get('academicYearId');
    const branchId = formData.get('branchId') || undefined;
    const className = formData.get('class');
    const shiftName = (formData.get('shiftName') || '').toString().trim();
    const term1 = parseFloat(formData.get('term1') || '0');
    const term2 = parseFloat(formData.get('term2') || '0');
    const bookFee = parseFloat(formData.get('bookFee') || '0');

    if (!academicYearId || !className) {
        return { error: 'Academic Year and Class are required' };
    }
    if (!branchId) {
        return { error: 'Branch is required (multi-branch parity with Electron)' };
    }

    try {
        await dbConnect();

        // Upsert logic: if exists, update it.
        // For shiftName == '' treat missing/null as the same "default shift" to avoid duplicates.
        const baseQuery = { academicYearId, branchId, class: className };
        const query = shiftName
            ? { ...baseQuery, shiftName }
            : { ...baseQuery, $or: [{ shiftName: '' }, { shiftName: { $exists: false } }, { shiftName: null }] };

        await FeeStructure.findOneAndUpdate(query, {
            academicYearId,
            branchId,
            class: className,
            shiftName,
            components: { term1, term2, bookFee }
        }, { upsert: true, new: true, runValidators: true });

        revalidatePath('/dashboard/fees/structures');
        return { success: true };
    } catch (error) {
        console.error('Error saving fee structure:', error);
        return { error: 'Failed to save Fee Structure' };
    }
}

export async function getFeeStructures(academicYearId, branchId = null) {
    if (!academicYearId) return [];
    await dbConnect();

    let query = { academicYearId };
    if (branchId) {
        // Avoid duplicates: if branch-scoped data exists, show only that.
        const branchCount = await FeeStructure.countDocuments({ academicYearId, branchId });
        if (branchCount > 0) {
            query = { academicYearId, branchId };
        } else {
            // fallback for legacy DBs where branchId was not stored
            query = { academicYearId, $or: [{ branchId: { $exists: false } }, { branchId: null }] };
        }
    }

    const structures = await FeeStructure.find(query).sort({ class: 1, shiftName: 1 }).lean();
    return structures.map(s => ({
        ...s,
        _id: s._id.toString(),
        academicYearId: s.academicYearId.toString(),
        branchId: s.branchId?.toString?.() || s.branchId || null,
    }));
}
