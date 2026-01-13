'use server';

import dbConnect from '@/lib/db';
import { dateToISOString, idToString } from '@/lib/serialize';
import AcademicYear from '@/models/AcademicYear';
import StudentEnrollment from '@/models/StudentEnrollment';
import FeeRecord from '@/models/FeeRecord';
import { revalidatePath } from 'next/cache';

export async function createAcademicYear(formData) {
    const name = formData.get('name');
    const startDate = formData.get('startDate');
    const endDate = formData.get('endDate');

    if (!name || !startDate || !endDate) {
        return { error: 'All fields are required' };
    }

    try {
        await dbConnect();

        const existing = await AcademicYear.findOne({ name });
        if (existing) {
            return { error: 'Academic Year with this name already exists' };
        }

        await AcademicYear.create({
            name,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            isActive: false,
        });

        revalidatePath('/dashboard/academic-years');
        revalidatePath('/dashboard');
        return { success: true };
    } catch (error) {
        return { error: 'Failed to create Academic Year' };
    }
}

export async function getAcademicYears() {
    await dbConnect();
    const years = await AcademicYear.find({}).sort({ startDate: -1 }).lean();
    return years.map(year => ({
        ...year,
        _id: idToString(year._id),
        startDate: dateToISOString(year.startDate),
        endDate: dateToISOString(year.endDate),
    }));
}

export async function getAcademicYearById(id) {
    await dbConnect();
    const year = await AcademicYear.findById(id).lean();
    if (!year) return null;

    return {
        ...year,
        _id: idToString(year._id),
        startDate: dateToISOString(year.startDate, { dateOnly: true }),
        endDate: dateToISOString(year.endDate, { dateOnly: true }),
    };
}

export async function updateAcademicYear(id, formData) {
    await dbConnect();

    const data = {};
    const name = formData.get('name');
    const startDate = formData.get('startDate');
    const endDate = formData.get('endDate');

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
        if (error.code === 11000) {
            return { error: 'Academic Year with this name already exists' };
        }
        return { error: error.message || 'Failed to update Academic Year' };
    }
}

export async function setActiveYear(id) {
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
        revalidatePath('/dashboard/enrollment');
        return { success: true };
    } catch (error) {
        return { error: error.message || 'Failed to set active year' };
    }
}

export async function deleteAcademicYear(id) {
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
        return { error: error.message || 'Failed to delete Academic Year' };
    }
}

export async function lockAcademicYear(id, lock = true) {
    await dbConnect();

    try {
        const year = await AcademicYear.findByIdAndUpdate(id, { isLocked: lock }, { new: true });
        if (!year) {
            return { error: 'Academic Year not found' };
        }

        revalidatePath('/dashboard/academic-years');
        return { success: true };
    } catch (error) {
        return { error: error.message || 'Failed to lock Academic Year' };
    }
}

export async function getActiveAcademicYear() {
    await dbConnect();
    const year = await AcademicYear.findOne({ isActive: true }).lean();
    if (!year) return null;

    return {
        ...year,
        _id: idToString(year._id),
        startDate: dateToISOString(year.startDate),
        endDate: dateToISOString(year.endDate),
    };
}
