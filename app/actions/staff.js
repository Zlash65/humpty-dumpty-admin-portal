'use server';

import dbConnect from '@/lib/db';
import Staff from '@/models/Staff';
import { revalidatePath } from 'next/cache';

// CREATE Staff
export async function createStaff(formData) {
    const data = {
        name: formData.get('name'),
        contact: formData.get('contact') || undefined,
        email: formData.get('email') || undefined,
        staffType: formData.get('staffType') || 'office',
        role: formData.get('role') || undefined,
        branchId: formData.get('branchId') || undefined,
    };

    // Parse assignments for teachers
    const assignmentsJson = formData.get('assignments');
    if (assignmentsJson && data.staffType === 'teacher') {
        try {
            data.assignments = JSON.parse(assignmentsJson);
        } catch {
            data.assignments = [];
        }
    }

    if (!data.name) {
        return { error: 'Staff name is required' };
    }

    if (!data.staffType) {
        return { error: 'Staff type is required' };
    }

    try {
        await dbConnect();
        const staff = await Staff.create(data);
        revalidatePath('/dashboard/staff');
        return { success: true, staff: JSON.parse(JSON.stringify(staff)) };
    } catch (error) {
        console.error('Error creating staff:', error);
        return { error: error.message || 'Failed to create staff' };
    }
}

// READ all Staff
export async function getStaff(filters = {}) {
    await dbConnect();

    const query = { isActive: true };

    if (filters.branchId) {
        query.branchId = filters.branchId;
    }

    if (filters.staffType) {
        query.staffType = filters.staffType;
    }

    if (filters.search) {
        query.$or = [
            { name: { $regex: filters.search, $options: 'i' } },
            { contact: { $regex: filters.search, $options: 'i' } },
            { role: { $regex: filters.search, $options: 'i' } },
        ];
    }

    const staff = await Staff.find(query)
        .populate('branchId', 'name')
        .sort({ name: 1 })
        .limit(filters.limit || 100)
        .lean();

    return staff.map(s => ({
        ...s,
        _id: s._id.toString(),
        branchId: s.branchId?._id?.toString() || s.branchId?.toString() || null,
        branchName: s.branchId?.name || null,
        createdAt: s.createdAt?.toISOString(),
        updatedAt: s.updatedAt?.toISOString(),
    }));
}

// READ single Staff by ID
export async function getStaffById(id) {
    await dbConnect();

    const staff = await Staff.findById(id)
        .populate('branchId', 'name')
        .lean();

    if (!staff) {
        return null;
    }

    return {
        ...staff,
        _id: staff._id.toString(),
        branchId: staff.branchId?._id?.toString() || staff.branchId?.toString() || null,
        branchName: staff.branchId?.name || null,
        createdAt: staff.createdAt?.toISOString(),
        updatedAt: staff.updatedAt?.toISOString(),
    };
}

// UPDATE Staff
export async function updateStaff(id, formData) {
    await dbConnect();

    const data = {};
    const fields = ['name', 'contact', 'email', 'staffType', 'role', 'branchId'];

    fields.forEach(field => {
        const value = formData.get(field);
        if (value !== null && value !== undefined) {
            data[field] = value || undefined;
        }
    });

    // Parse assignments for teachers
    const assignmentsJson = formData.get('assignments');
    if (assignmentsJson) {
        try {
            data.assignments = JSON.parse(assignmentsJson);
        } catch {
            // Keep existing assignments if parsing fails
        }
    }

    try {
        const staff = await Staff.findByIdAndUpdate(id, data, { new: true });
        if (!staff) {
            return { error: 'Staff not found' };
        }
        revalidatePath('/dashboard/staff');
        return { success: true, staff: JSON.parse(JSON.stringify(staff)) };
    } catch (error) {
        console.error('Error updating staff:', error);
        return { error: error.message || 'Failed to update staff' };
    }
}

// DELETE Staff (soft delete)
export async function deleteStaff(id) {
    await dbConnect();

    try {
        const staff = await Staff.findByIdAndUpdate(id, { isActive: false }, { new: true });
        if (!staff) {
            return { error: 'Staff not found' };
        }
        revalidatePath('/dashboard/staff');
        return { success: true };
    } catch (error) {
        console.error('Error deleting staff:', error);
        return { error: error.message || 'Failed to delete staff' };
    }
}

// Search Staff
export async function searchStaff(query, branchId = null, limit = 50) {
    await dbConnect();

    const searchQuery = {
        isActive: true,
        $or: [
            { name: { $regex: query, $options: 'i' } },
            { contact: { $regex: query, $options: 'i' } },
            { role: { $regex: query, $options: 'i' } },
        ]
    };

    if (branchId) {
        searchQuery.branchId = branchId;
    }

    const staff = await Staff.find(searchQuery)
        .limit(limit)
        .lean();

    return staff.map(s => ({
        ...s,
        _id: s._id.toString(),
    }));
}

// Get staff count for dashboard
export async function getStaffCount(branchId = null) {
    await dbConnect();

    const query = { isActive: true };
    if (branchId) {
        query.branchId = branchId;
    }

    return await Staff.countDocuments(query);
}

// Get teachers count
export async function getTeacherCount(branchId = null) {
    await dbConnect();

    const query = { isActive: true, staffType: 'teacher' };
    if (branchId) {
        query.branchId = branchId;
    }

    return await Staff.countDocuments(query);
}
