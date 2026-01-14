'use server';

import dbConnect from '@/lib/db';
import { dateToISOString, idToString } from '@/lib/serialize';
import FeeStructure from '@/models/FeeStructure';
import { revalidatePath } from 'next/cache';

export async function createFeeStructure(formData) {
    const academicYearId = formData.get('academicYearId');
    const branchId = formData.get('branchId') || undefined;
    const className = formData.get('class');
    const shiftName = (formData.get('shiftName') || '').toString().trim();
    const startTime = (formData.get('startTime') || '').toString().trim();
    const endTime = (formData.get('endTime') || '').toString().trim();
    const numDivisions = parseInt(formData.get('numDivisions') || '1', 10) || 1;
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
            startTime,
            endTime,
            numDivisions,
            components: { term1, term2, bookFee }
        }, { upsert: true, new: true, runValidators: true });

        revalidatePath('/dashboard/fees/structures');
        return { success: true };
    } catch (error) {
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
        // Keep returned objects Server->Client safe: avoid Date/ObjectId instances
        _id: idToString(s._id),
        academicYearId: idToString(s.academicYearId),
        branchId: idToString(s.branchId),
        class: s.class,
        shiftName: s.shiftName || '',
        startTime: s.startTime || '',
        endTime: s.endTime || '',
        numDivisions: Number(s.numDivisions) || 1,
        components: {
            term1: Number(s.components?.term1) || 0,
            term2: Number(s.components?.term2) || 0,
            bookFee: Number(s.components?.bookFee) || 0,
        },
        createdAt: dateToISOString(s.createdAt),
        updatedAt: dateToISOString(s.updatedAt),
    }));
}

export async function updateFeeStructure(id, formData) {
    if (!id) return { error: 'Class entry is required' };

    const academicYearId = formData.get('academicYearId');
    const branchId = formData.get('branchId') || undefined;
    const className = formData.get('class');
    const shiftName = (formData.get('shiftName') || '').toString().trim();
    const startTime = (formData.get('startTime') || '').toString().trim();
    const endTime = (formData.get('endTime') || '').toString().trim();
    const numDivisions = parseInt(formData.get('numDivisions') || '1', 10) || 1;
    const term1 = parseFloat(formData.get('term1') || '0');
    const term2 = parseFloat(formData.get('term2') || '0');
    const bookFee = parseFloat(formData.get('bookFee') || '0');

    if (!academicYearId || !className) return { error: 'Academic Year and Class are required' };
    if (!branchId) return { error: 'Branch is required (multi-branch parity with Electron)' };

    await dbConnect();
    const updated = await FeeStructure.findByIdAndUpdate(
        id,
        {
            academicYearId,
            branchId,
            class: className,
            shiftName,
            startTime,
            endTime,
            numDivisions,
            components: { term1, term2, bookFee },
        },
        { new: true, runValidators: true }
    );
    if (!updated) return { error: 'Class entry not found' };

    revalidatePath('/dashboard/classes');
    revalidatePath('/dashboard/fees/structures');
    return { success: true };
}

export async function deleteFeeStructure(id) {
    if (!id) return { error: 'Class entry is required' };
    await dbConnect();

    const res = await FeeStructure.findByIdAndDelete(id);
    if (!res) return { error: 'Class entry not found' };
    revalidatePath('/dashboard/classes');
    revalidatePath('/dashboard/fees/structures');
    return { success: true };
}
