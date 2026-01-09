'use server';

import dbConnect from '@/lib/db';
import AcademicYear from '@/models/AcademicYear';
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
