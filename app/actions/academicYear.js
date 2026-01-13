'use server';

import dbConnect from '@/lib/db';
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

        // Check for duplicate name
        const existing = await AcademicYear.findOne({ name });
        if (existing) {
            return { error: 'Academic Year with this name already exists' };
        }

        await AcademicYear.create({
            name,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            isActive: false, // Default to inactive
        });

        revalidatePath('/dashboard/academic-years');
        revalidatePath('/dashboard');
        return { success: true };
    } catch (error) {
        console.error('Error creating academic year:', error);
        return { error: 'Failed to create Academic Year' };
    }
}

export async function getAcademicYears() {
    await dbConnect();
    // Sort by name descending (newest first usually) or by startDate
    const years = await AcademicYear.find({}).sort({ startDate: -1 }).lean();
    // Convert _id and dates to plain strings/values for Client Components if needed,
    // but Server Components can handle Dates. _id needs toString sometimes.
    return years.map(year => ({
        ...year,
        _id: year._id.toString(),
        startDate: year.startDate.toISOString(),
        endDate: year.endDate.toISOString(),
    }));
}

export async function getAcademicYearById(id) {
    await dbConnect();
    const year = await AcademicYear.findById(id).lean();
    if (!year) return null;

    return {
        ...year,
        _id: year._id.toString(),
        startDate: year.startDate.toISOString().split('T')[0],
        endDate: year.endDate.toISOString().split('T')[0],
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
        console.error('Error updating academic year:', error);
        if (error.code === 11000) {
            return { error: 'Academic Year with this name already exists' };
        }
        return { error: error.message || 'Failed to update Academic Year' };
    }
}

export async function setActiveYear(id) {
    await dbConnect();

    try {
        // First, deactivate all years
        await AcademicYear.updateMany({}, { isActive: false });

        // Then activate the selected year
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
        console.error('Error setting active year:', error);
        return { error: error.message || 'Failed to set active year' };
    }
}

export async function deleteAcademicYear(id) {
    await dbConnect();

    try {
        // Check if there are enrollments or fee records linked to this year
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
        console.error('Error deleting academic year:', error);
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
        console.error('Error locking academic year:', error);
        return { error: error.message || 'Failed to lock Academic Year' };
    }
}

// Get the currently active academic year
export async function getActiveAcademicYear() {
    await dbConnect();
    const year = await AcademicYear.findOne({ isActive: true }).lean();
    if (!year) return null;

    return {
        ...year,
        _id: year._id.toString(),
        startDate: year.startDate.toISOString(),
        endDate: year.endDate.toISOString(),
    };
}
