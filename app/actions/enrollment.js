'use server';

import dbConnect from '@/lib/db';
import { dateToISOString, idToString } from '@/lib/serialize';
import StudentEnrollment from '@/models/StudentEnrollment';
import AcademicYear from '@/models/AcademicYear';
import FeeStructure from '@/models/FeeStructure';
import FeeRecord from '@/models/FeeRecord';
import Student from '@/models/Student';
import { revalidatePath } from 'next/cache';

function applyScholarshipToFeeAmounts({ term1 = 0, term2 = 0, bookFee = 0 }, scholarshipRaw) {
    let scholarship = Number(scholarshipRaw) || 0;
    if (scholarship <= 0) return { term1, term2, bookFee };

    const out = { term1: Number(term1) || 0, term2: Number(term2) || 0, bookFee: Number(bookFee) || 0 };
    for (const key of ['term1', 'term2', 'bookFee']) {
        if (scholarship <= 0) break;
        const take = Math.min(out[key], scholarship);
        out[key] = Math.max(0, out[key] - take);
        scholarship -= take;
    }
    return out;
}

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

        const year = await AcademicYear.findById(academicYearId);
        if (!year) return { error: 'Invalid Academic Year' };

        const student = await Student.findById(studentId).select('branchId feeScholarship').lean();
        const branchId = student?.branchId?.toString?.() || student?.branchId || null;
        const feeScholarship = Number(student?.feeScholarship) || 0;

        const existing = await StudentEnrollment.findOne({ academicYearId, studentId });
        if (existing) {
            return { error: 'Student is already enrolled in this Academic Year' };
        }

        // Fetch Fee Structure for this Class/Year (prefer branch-scoped; prefer default shift)
        let feeStructure = null;
        if (branchId) {
            feeStructure =
                (await FeeStructure.findOne({ academicYearId, branchId, class: className, shiftName: '' })) ||
                (await FeeStructure.findOne({ academicYearId, branchId, class: className }));
        }
        if (!feeStructure) {
            feeStructure =
                (await FeeStructure.findOne({ academicYearId, class: className, shiftName: '' })) ||
                (await FeeStructure.findOne({ academicYearId, class: className }));
        }

        const enrollment = await StudentEnrollment.create({
            academicYearId,
            studentId,
            class: className,
            section,
            rollNumber,
            shiftName: feeStructure?.shiftName || '',
            status: 'Active',
        });

        const feeRecordData = {
            academicYearId,
            studentId,
            enrollmentId: enrollment._id,
            branchId: branchId || undefined,
            fees: {
                term1: { amount: 0, paid: 0, status: 'Pending' },
                term2: { amount: 0, paid: 0, status: 'Pending' },
                bookFee: { amount: 0, paid: 0, status: 'Pending' },
            }
        };

        if (feeStructure) {
            const adjusted = applyScholarshipToFeeAmounts(
                {
                    term1: feeStructure.components.term1,
                    term2: feeStructure.components.term2,
                    bookFee: feeStructure.components.bookFee,
                },
                feeScholarship
            );
            feeRecordData.fees.term1.amount = adjusted.term1;
            feeRecordData.fees.term2.amount = adjusted.term2;
            feeRecordData.fees.bookFee.amount = adjusted.bookFee;
        }

        // If scholarship fully covers a head, mark it as paid (Electron parity: pending becomes 0).
        for (const head of ['term1', 'term2', 'bookFee']) {
            if ((feeRecordData.fees[head].amount || 0) <= 0) {
                feeRecordData.fees[head].status = 'Paid';
            }
        }

        await FeeRecord.create(feeRecordData);

        revalidatePath('/dashboard/enrollment');
        return { success: true };
    } catch (error) {
        return { error: 'Failed to enroll student' };
    }
}

export async function getEnrollments(academicYearId) {
    if (!academicYearId) return [];

    await dbConnect();
    const enrollments = await StudentEnrollment.find({ academicYearId })
        .populate('studentId', 'firstName lastName admissionNumber')
        .sort({ class: 1, section: 1, rollNumber: 1 })
        .lean();

    return enrollments.map(e => ({
        ...e,
        _id: idToString(e._id),
        academicYearId: idToString(e.academicYearId),
        studentId: {
            ...e.studentId,
            _id: idToString(e.studentId?._id),
        },
        joinDate: dateToISOString(e.joinDate),
    }));
}
