'use server';

import dbConnect from '@/lib/db';
import StudentEnrollment from '@/models/StudentEnrollment';
import AcademicYear from '@/models/AcademicYear';
import FeeStructure from '@/models/FeeStructure';
import FeeRecord from '@/models/FeeRecord';
import { revalidatePath } from 'next/cache';

export async function enrollStudent(formData) {
    const studentId = formData.get('studentId');
    const academicYearId = formData.get('academicYearId');
    const className = formData.get('class');
    const section = formData.get('section');
    const rollNumber = formData.get('rollNumber');

    if (!studentId || !academicYearId || !className || !section) {
        return { error: 'All fields are required' };
    }

    try {
        await dbConnect();

        // Verify academic year exists
        const year = await AcademicYear.findById(academicYearId);
        if (!year) return { error: 'Invalid Academic Year' };

        // Check if already enrolled
        const existing = await StudentEnrollment.findOne({ academicYearId, studentId });
        if (existing) {
            return { error: 'Student is already enrolled in this Academic Year' };
        }

        // 1. Create Enrollment
        const enrollment = await StudentEnrollment.create({
            academicYearId,
            studentId,
            class: className,
            section,
            rollNumber,
            status: 'Active',
        });

        // 2. Fetch Fee Structure for this Class/Year
        const feeStructure = await FeeStructure.findOne({ academicYearId, class: className });

        // 3. Create Initial Fee Record
        const feeRecordData = {
            academicYearId,
            studentId,
            enrollmentId: enrollment._id,
            fees: {
                term1: { amount: 0, paid: 0, status: 'Pending' },
                term2: { amount: 0, paid: 0, status: 'Pending' },
                bookFee: { amount: 0, paid: 0, status: 'Pending' },
            }
        };

        if (feeStructure) {
            feeRecordData.fees.term1.amount = feeStructure.components.term1;
            feeRecordData.fees.term2.amount = feeStructure.components.term2;
            feeRecordData.fees.bookFee.amount = feeStructure.components.bookFee;
        }

        await FeeRecord.create(feeRecordData);

        revalidatePath('/dashboard/enrollment');
        return { success: true };
    } catch (error) {
        console.error('Error enrolling student and generating fees:', error);
        return { error: 'Failed to enroll student' };
    }
}

export async function getEnrollments(academicYearId) {
    if (!academicYearId) return [];

    await dbConnect();
    // Populate student details
    const enrollments = await StudentEnrollment.find({ academicYearId })
        .populate('studentId', 'firstName lastName admissionNumber')
        .sort({ class: 1, section: 1, rollNumber: 1 })
        .lean();

    return enrollments.map(e => ({
        ...e,
        _id: e._id.toString(),
        academicYearId: e.academicYearId.toString(),
        studentId: {
            ...e.studentId,
            _id: e.studentId._id.toString(),
        },
        joinDate: e.joinDate.toISOString(),
    }));
}
