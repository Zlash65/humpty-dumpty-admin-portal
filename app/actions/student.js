'use server';

import dbConnect from '@/lib/db';
import { dateToISOString, idToString, pickRefName } from '@/lib/serialize';
import Student from '@/models/Student';
import { revalidatePath } from 'next/cache';

export async function createStudent(formData) {
    const data = {
        admissionNumber: formData.get('admissionNumber'),
        firstName: formData.get('firstName'),
        lastName: formData.get('lastName'),
        dob: formData.get('dob'),
        gender: formData.get('gender'),
        birthPlace: formData.get('birthPlace') || undefined,
        religion: formData.get('religion') || undefined,
        address: formData.get('address') || undefined,
        fatherName: formData.get('fatherName') || undefined,
        motherName: formData.get('motherName') || undefined,
        parentContact1: formData.get('parentContact1') || undefined,
        parentContact2: formData.get('parentContact2') || undefined,
        branchId: formData.get('branchId') || undefined,
        feeScholarship: parseFloat(formData.get('feeScholarship')) || 0,
    };

    // Validate required fields
    if (!data.admissionNumber || !data.firstName || !data.lastName || !data.dob || !data.gender) {
        return { error: 'Required fields missing' };
    }

    try {
        await dbConnect();

        // Check duplicate admission number
        const existing = await Student.findOne({ admissionNumber: data.admissionNumber });
        if (existing) {
            return { error: 'Student with this Admission Number already exists' };
        }

        const student = await Student.create({
            ...data,
            dob: new Date(data.dob),
            isActive: true,
        });

        revalidatePath('/dashboard/students');
        return { success: true, student: JSON.parse(JSON.stringify(student)) };
    } catch (error) {
        console.error('Error creating student:', error);
        return { error: error.message || 'Failed to create Student' };
    }
}

export async function getStudents(filters = {}) {
    await dbConnect();

    const query = { isActive: true };

    if (filters.branchId) {
        query.branchId = filters.branchId;
    }

    if (filters.search) {
        query.$or = [
            { firstName: { $regex: filters.search, $options: 'i' } },
            { lastName: { $regex: filters.search, $options: 'i' } },
            { admissionNumber: { $regex: filters.search, $options: 'i' } },
        ];
    }

    const students = await Student.find(query)
        .populate('branchId', 'name')
        .sort({ createdAt: -1 })
        .limit(filters.limit || 100)
        .lean();

    return students.map(s => ({
        ...s,
        _id: idToString(s._id),
        branchId: idToString(s.branchId),
        branchName: pickRefName(s.branchId),
        dob: dateToISOString(s.dob),
        joinedAt: dateToISOString(s.joinedAt),
        createdAt: dateToISOString(s.createdAt),
        updatedAt: dateToISOString(s.updatedAt),
    }));
}

export async function getStudentById(id) {
    await dbConnect();

    const student = await Student.findById(id)
        .populate('branchId', 'name')
        .lean();

    if (!student) {
        return null;
    }

    return {
        ...student,
        _id: idToString(student._id),
        branchId: idToString(student.branchId),
        branchName: pickRefName(student.branchId),
        dob: dateToISOString(student.dob, { dateOnly: true }),
        joinedAt: dateToISOString(student.joinedAt, { dateOnly: true }),
    };
}

export async function updateStudent(id, formData) {
    await dbConnect();

    const data = {};
    const fields = [
        'firstName', 'lastName', 'dob', 'gender', 'birthPlace', 'religion',
        'address', 'fatherName', 'motherName', 'parentContact1', 'parentContact2',
        'branchId', 'feeScholarship'
    ];

    fields.forEach(field => {
        const value = formData.get(field);
        if (value !== null && value !== '' && value !== undefined) {
            if (field === 'feeScholarship') {
                data[field] = parseFloat(value) || 0;
            } else if (field === 'dob') {
                data[field] = new Date(value);
            } else {
                data[field] = value;
            }
        }
    });

    try {
        const student = await Student.findByIdAndUpdate(id, data, { new: true });
        if (!student) {
            return { error: 'Student not found' };
        }
        revalidatePath('/dashboard/students');
        return { success: true, student: JSON.parse(JSON.stringify(student)) };
    } catch (error) {
        console.error('Error updating student:', error);
        return { error: error.message || 'Failed to update Student' };
    }
}

export async function deleteStudent(id) {
    await dbConnect();

    try {
        const student = await Student.findByIdAndUpdate(id, { isActive: false }, { new: true });
        if (!student) {
            return { error: 'Student not found' };
        }
        revalidatePath('/dashboard/students');
        return { success: true };
    } catch (error) {
        console.error('Error deleting student:', error);
        return { error: error.message || 'Failed to delete Student' };
    }
}

export async function searchStudents(query, branchId = null, limit = 50) {
    await dbConnect();

    const searchQuery = {
        isActive: true,
        $or: [
            { firstName: { $regex: query, $options: 'i' } },
            { lastName: { $regex: query, $options: 'i' } },
            { admissionNumber: { $regex: query, $options: 'i' } },
        ]
    };

    if (branchId) {
        searchQuery.branchId = branchId;
    }

    const students = await Student.find(searchQuery)
        .limit(limit)
        .lean();

    return students.map(s => ({
        ...s,
        _id: idToString(s._id),
        dob: dateToISOString(s.dob, { dateOnly: true }),
        fullName: `${s.firstName} ${s.lastName}`,
    }));
}

export async function getStudentCount(branchId = null) {
    await dbConnect();

    const query = { isActive: true };
    if (branchId) {
        query.branchId = branchId;
    }

    return await Student.countDocuments(query);
}
