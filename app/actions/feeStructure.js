'use server';

import dbConnect from '@/lib/db';
import { idToString } from '@/lib/serialize';
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
        const branchCount = await FeeStructure.countDocuments({ academicYearId, branchId });
        if (branchCount > 0) {
            query = { academicYearId, branchId };
        } else {
            query = { academicYearId, $or: [{ branchId: { $exists: false } }, { branchId: null }] };
        }
    }

    const structures = await FeeStructure.find(query).sort({ class: 1, shiftName: 1 }).lean();
    return structures.map(s => ({
        ...s,
        _id: idToString(s._id),
        academicYearId: idToString(s.academicYearId),
        branchId: idToString(s.branchId),
    }));
}
