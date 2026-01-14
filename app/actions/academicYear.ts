'use server';

import dbConnect from '@/lib/db';
import { dateToISOString, idToString } from '@/lib/serialize';
import AcademicYear from '@/models/AcademicYear';
import StudentEnrollment from '@/models/StudentEnrollment';
import FeeRecord from '@/models/FeeRecord';
import FeeStructure from '@/models/FeeStructure';
import { revalidatePath } from 'next/cache';
import type { IAcademicYearDocument, IFeeStructureDocument } from '@/types';
import type { Types } from 'mongoose';

// Types for action results
interface ActionResult {
    success?: boolean;
    error?: string;
}

interface SerializedAcademicYear {
    _id: string;
    name?: string;
    startDate: string | undefined;
    endDate: string | undefined;
    isActive?: boolean;
    isLocked?: boolean;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
}

interface MongoError extends Error {
    code?: number;
}

export async function createAcademicYear(formData: FormData): Promise<ActionResult> {
    const name = formData.get('name') as string | null;
    const startDate = formData.get('startDate') as string | null;
    const endDate = formData.get('endDate') as string | null;

    if (!name || !startDate || !endDate) {
        return { error: 'All fields are required' };
    }

    try {
        await dbConnect();

        const existing = await AcademicYear.findOne({ name });
        if (existing) {
            return { error: 'Academic Year with this name already exists' };
        }

        const newYear = await AcademicYear.create({
            name,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            isActive: false,
        });

        // Electron parity: class/fee structure configuration does not disappear when adding a new year.
        // Our data model scopes FeeStructure by academicYearId, so copy forward from the currently active year
        // (or most recent year) so the new year is usable immediately.
        const sourceYear =
            (await AcademicYear.findOne({ isActive: true }).select('_id').lean()) ||
            (await AcademicYear.findOne({ _id: { $ne: newYear._id } }).sort({ startDate: -1 }).select('_id').lean());

        if (sourceYear?._id) {
            const existingCount = await FeeStructure.countDocuments({ academicYearId: newYear._id });
            if (existingCount === 0) {
                const sourceStructures = await FeeStructure.find({ academicYearId: sourceYear._id }).lean();
                if (sourceStructures.length) {
                    await FeeStructure.bulkWrite(
                        sourceStructures.map((s) => ({
                            updateOne: {
                                filter: {
                                    academicYearId: newYear._id,
                                    branchId: s.branchId ?? null,
                                    class: s.class,
                                    shiftName: s.shiftName || '',
                                },
                                update: {
                                    $setOnInsert: {
                                        academicYearId: newYear._id,
                                        branchId: s.branchId ?? null,
                                        class: s.class,
                                        shiftName: s.shiftName || '',
                                        startTime: s.startTime || '',
                                        endTime: s.endTime || '',
                                        numDivisions: s.numDivisions || 1,
                                        components: s.components || { term1: 0, term2: 0, bookFee: 0 },
                                    },
                                },
                                upsert: true,
                            },
                        })),
                        { ordered: false }
                    );
                }
            }
        }

        revalidatePath('/dashboard/academic-years');
        revalidatePath('/dashboard/classes');
        revalidatePath('/dashboard/fees/structures');
        revalidatePath('/dashboard');
        return { success: true };
    } catch {
        return { error: 'Failed to create Academic Year' };
    }
}

export async function getAcademicYears(): Promise<SerializedAcademicYear[]> {
    await dbConnect();
    const years = await AcademicYear.find({}).sort({ startDate: -1 }).lean();

    interface YearLean {
        _id: Types.ObjectId;
        name?: string;
        startDate?: Date;
        endDate?: Date;
        isActive?: boolean;
        isLocked?: boolean;
        createdAt?: Date;
        updatedAt?: Date;
    }

    return (years as unknown as YearLean[]).map(year => ({
        ...year,
        _id: idToString(year._id) || '',
        startDate: dateToISOString(year.startDate),
        endDate: dateToISOString(year.endDate),
        createdAt: dateToISOString(year.createdAt),
        updatedAt: dateToISOString(year.updatedAt),
    }));
}

export async function getAcademicYearById(id: string): Promise<SerializedAcademicYear | null> {
    await dbConnect();
    const year = await AcademicYear.findById(id).lean();
    if (!year) return null;

    interface YearLean {
        _id: Types.ObjectId;
        name?: string;
        startDate?: Date;
        endDate?: Date;
        isActive?: boolean;
        isLocked?: boolean;
        createdAt?: Date;
        updatedAt?: Date;
    }

    const y = year as unknown as YearLean;

    return {
        ...y,
        _id: idToString(y._id) || '',
        startDate: dateToISOString(y.startDate, { dateOnly: true }),
        endDate: dateToISOString(y.endDate, { dateOnly: true }),
        createdAt: dateToISOString(y.createdAt),
        updatedAt: dateToISOString(y.updatedAt),
    };
}

export async function updateAcademicYear(id: string, formData: FormData): Promise<ActionResult> {
    await dbConnect();

    const data: Record<string, string | Date> = {};
    const name = formData.get('name') as string | null;
    const startDate = formData.get('startDate') as string | null;
    const endDate = formData.get('endDate') as string | null;

    if (name) data.name = name;
    if (startDate) data.startDate = new Date(startDate);
    if (endDate) data.endDate = new Date(endDate);

    try {
        const year = await AcademicYear.findByIdAndUpdate(id, data, { new: true });
        if (!year) {
            return { error: 'Academic Year not found' };
        }
        revalidatePath('/dashboard/academic-years');
        revalidatePath('/dashboard');
        return { success: true };
    } catch (error) {
        const err = error as MongoError;
        if (err.code === 11000) {
            return { error: 'Academic Year with this name already exists' };
        }
        return { error: err.message || 'Failed to update Academic Year' };
    }
}

export async function setActiveYear(id: string): Promise<ActionResult> {
    await dbConnect();

    try {
        await AcademicYear.updateMany({}, { isActive: false });

        const year = await AcademicYear.findByIdAndUpdate(id, { isActive: true }, { new: true });
        if (!year) {
            return { error: 'Academic Year not found' };
        }

        revalidatePath('/dashboard/academic-years');
        revalidatePath('/dashboard');
        revalidatePath('/dashboard/fees');
        revalidatePath('/dashboard/classes');
        revalidatePath('/dashboard/fees/structures');
        revalidatePath('/dashboard/students');
        revalidatePath('/dashboard/enrollment');
        return { success: true };
    } catch (error) {
        const err = error as Error;
        return { error: err.message || 'Failed to set active year' };
    }
}

export async function deleteAcademicYear(id: string): Promise<ActionResult> {
    await dbConnect();

    try {
        const enrollmentCount = await StudentEnrollment.countDocuments({ academicYearId: id });
        const feeRecordCount = await FeeRecord.countDocuments({ academicYearId: id });

        if (enrollmentCount > 0 || feeRecordCount > 0) {
            return {
                error: `Cannot delete: ${enrollmentCount} enrollment(s) and ${feeRecordCount} fee record(s) are linked to this year`
            };
        }

        const year = await AcademicYear.findByIdAndDelete(id);
        if (!year) {
            return { error: 'Academic Year not found' };
        }

        revalidatePath('/dashboard/academic-years');
        revalidatePath('/dashboard');
        return { success: true };
    } catch (error) {
        const err = error as Error;
        return { error: err.message || 'Failed to delete Academic Year' };
    }
}

export async function lockAcademicYear(id: string, lock: boolean = true): Promise<ActionResult> {
    await dbConnect();

    try {
        const year = await AcademicYear.findByIdAndUpdate(id, { isLocked: lock }, { new: true });
        if (!year) {
            return { error: 'Academic Year not found' };
        }

        revalidatePath('/dashboard/academic-years');
        return { success: true };
    } catch (error) {
        const err = error as Error;
        return { error: err.message || 'Failed to lock Academic Year' };
    }
}

export async function getActiveAcademicYear(): Promise<SerializedAcademicYear | null> {
    await dbConnect();
    const year = await AcademicYear.findOne({ isActive: true }).lean();
    if (!year) return null;

    interface YearLean {
        _id: Types.ObjectId;
        name?: string;
        startDate?: Date;
        endDate?: Date;
        isActive?: boolean;
        isLocked?: boolean;
    }

    const y = year as unknown as YearLean;

    return {
        ...y,
        _id: idToString(y._id) || '',
        startDate: dateToISOString(y.startDate),
        endDate: dateToISOString(y.endDate),
    };
}
