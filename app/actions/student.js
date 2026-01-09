'use server';

import dbConnect from '@/lib/db';
import Student from '@/models/Student';
import { revalidatePath } from 'next/cache';

export async function createStudent(formData) {
    const firstName = formData.get('firstName');
    const lastName = formData.get('lastName');
    const admissionNumber = formData.get('admissionNumber');
    const dob = formData.get('dob');
    const gender = formData.get('gender');

    if (!firstName || !lastName || !admissionNumber || !dob || !gender) {
        return { error: 'Required fields missing' };
    }

    try {
        await dbConnect();

        // Check duplicate admission number
        const existing = await Student.findOne({ admissionNumber });
        if (existing) {
            return { error: 'Student with this Admission Number already exists' };
        }

        await Student.create({
            firstName,
            lastName,
            admissionNumber,
            dob: new Date(dob),
            gender,
            isActive: true,
        });

        revalidatePath('/dashboard/students');
        return { success: true };
    } catch (error) {
        console.error('Error creating student:', error);
        return { error: 'Failed to create Student' };
    }
}

export async function getStudents() {
    await dbConnect();
    const students = await Student.find({ isActive: true }).sort({ createdAt: -1 }).lean();
    return students.map(s => ({
        ...s,
        _id: s._id.toString(),
        dob: s.dob.toISOString(),
        joinedAt: s.joinedAt.toISOString(),
    }));
}
