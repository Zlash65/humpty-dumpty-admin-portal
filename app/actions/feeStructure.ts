'use server';

import dbConnect from '@/lib/db';
import { dateToISOString, idToString } from '@/lib/serialize';
import FeeStructure from '@/models/FeeStructure';
import { revalidatePath } from 'next/cache';
import type { IFeeStructureDocument, IFeeComponents } from '@/types';
import type { FilterQuery, Types } from 'mongoose';

// Types for action results
interface ActionResult {
    success?: boolean;
    error?: string;
}

interface SerializedFeeStructure {
    _id: string;
    academicYearId: string;
    branchId: string | null;
    class: string;
    shiftName: string;
    startTime: string;
    endTime: string;
    numDivisions: number;
    components: IFeeComponents;
    createdAt: string | undefined;
    updatedAt: string | undefined;
}

export async function createFeeStructure(formData: FormData): Promise<ActionResult> {
    const academicYearId = formData.get('academicYearId') as string | null;
    const branchId = (formData.get('branchId') as string | null) || undefined;
    const className = formData.get('class') as string | null;
    const shiftName = ((formData.get('shiftName') as string | null) || '').trim();
    const startTime = ((formData.get('startTime') as string | null) || '').trim();
    const endTime = ((formData.get('endTime') as string | null) || '').trim();
    const numDivisions = parseInt((formData.get('numDivisions') as string | null) || '1', 10) || 1;
    const term1 = parseFloat((formData.get('term1') as string | null) || '0');
    const term2 = parseFloat((formData.get('term2') as string | null) || '0');
    const bookFee = parseFloat((formData.get('bookFee') as string | null) || '0');

    if (!academicYearId || !className) {
        return { error: 'Academic Year and Class are required' };
    }
    if (!branchId) {
        return { error: 'Branch is required (multi-branch parity with Electron)' };
    }

    try {
        await dbConnect();

        interface BaseQuery {
            academicYearId: string;
            branchId: string;
            class: string;
        }

        interface QueryWithShift extends BaseQuery {
            shiftName: string;
        }

        interface QueryWithOr extends BaseQuery {
            $or: Array<{ shiftName: string } | { shiftName: { $exists: boolean } } | { shiftName: null }>;
        }

        const baseQuery: BaseQuery = { academicYearId, branchId, class: className };
        const query: QueryWithShift | QueryWithOr = shiftName
            ? { ...baseQuery, shiftName }
            : { ...baseQuery, $or: [{ shiftName: '' }, { shiftName: { $exists: false } }, { shiftName: null }] };

        await FeeStructure.findOneAndUpdate(query as FilterQuery<IFeeStructureDocument>, {
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
    } catch {
        return { error: 'Failed to save Fee Structure' };
    }
}

export async function getFeeStructures(academicYearId: string, branchId: string | null = null): Promise<SerializedFeeStructure[]> {
    if (!academicYearId) return [];
    await dbConnect();

    interface FeeStructureQuery {
        academicYearId: string;
        branchId?: string;
        $or?: Array<{ branchId: { $exists: boolean } } | { branchId: null }>;
    }

    let query: FeeStructureQuery = { academicYearId };
    if (branchId) {
        const branchCount = await FeeStructure.countDocuments({ academicYearId, branchId });
        if (branchCount > 0) {
            query = { academicYearId, branchId };
        } else {
            query = { academicYearId, $or: [{ branchId: { $exists: false } }, { branchId: null }] };
        }
    }

    const structures = await FeeStructure.find(query as FilterQuery<IFeeStructureDocument>).sort({ class: 1, shiftName: 1 }).lean();

    interface StructureLean {
        _id: Types.ObjectId;
        academicYearId?: Types.ObjectId;
        branchId?: Types.ObjectId;
        class?: string;
        shiftName?: string;
        startTime?: string;
        endTime?: string;
        numDivisions?: number;
        components?: IFeeComponents;
        createdAt?: Date;
        updatedAt?: Date;
    }

    return (structures as unknown as StructureLean[]).map(s => ({
        // Keep returned objects Server->Client safe: avoid Date/ObjectId instances
        _id: idToString(s._id) || '',
        academicYearId: idToString(s.academicYearId) || '',
        branchId: idToString(s.branchId),
        class: s.class || '',
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

export async function updateFeeStructure(id: string, formData: FormData): Promise<ActionResult> {
    if (!id) return { error: 'Class entry is required' };

    const academicYearId = formData.get('academicYearId') as string | null;
    const branchId = (formData.get('branchId') as string | null) || undefined;
    const className = formData.get('class') as string | null;
    const shiftName = ((formData.get('shiftName') as string | null) || '').trim();
    const startTime = ((formData.get('startTime') as string | null) || '').trim();
    const endTime = ((formData.get('endTime') as string | null) || '').trim();
    const numDivisions = parseInt((formData.get('numDivisions') as string | null) || '1', 10) || 1;
    const term1 = parseFloat((formData.get('term1') as string | null) || '0');
    const term2 = parseFloat((formData.get('term2') as string | null) || '0');
    const bookFee = parseFloat((formData.get('bookFee') as string | null) || '0');

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

export async function deleteFeeStructure(id: string): Promise<ActionResult> {
    if (!id) return { error: 'Class entry is required' };
    await dbConnect();

    const res = await FeeStructure.findByIdAndDelete(id);
    if (!res) return { error: 'Class entry not found' };
    revalidatePath('/dashboard/classes');
    revalidatePath('/dashboard/fees/structures');
    return { success: true };
}
