'use server';

import dbConnect from '@/lib/db';
import FeeStructure from '@/models/FeeStructure';
import { revalidatePath } from 'next/cache';

export async function createFeeStructure(formData) {
    const academicYearId = formData.get('academicYearId');
    const className = formData.get('class');
    const term1 = parseFloat(formData.get('term1') || '0');
    const term2 = parseFloat(formData.get('term2') || '0');
    const bookFee = parseFloat(formData.get('bookFee') || '0');

    if (!academicYearId || !className) {
        return { error: 'Academic Year and Class are required' };
    }

    try {
        await dbConnect();

        // Upsert logic: if exists for year+class, update it
        await FeeStructure.findOneAndUpdate(
            { academicYearId, class: className },
            {
                academicYearId,
                class: className,
                components: { term1, term2, bookFee }
            },
            { upsert: true, new: true, runValidators: true }
        );

        revalidatePath('/dashboard/fees/structures');
        return { success: true };
    } catch (error) {
        console.error('Error saving fee structure:', error);
        return { error: 'Failed to save Fee Structure' };
    }
}

export async function getFeeStructures(academicYearId) {
    if (!academicYearId) return [];
    await dbConnect();
    const structures = await FeeStructure.find({ academicYearId }).sort({ class: 1 }).lean();
    return structures.map(s => ({
        ...s,
        _id: s._id.toString(),
        academicYearId: s.academicYearId.toString(),
    }));
}
