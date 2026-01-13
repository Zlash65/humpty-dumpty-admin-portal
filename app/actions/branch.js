'use server';

import dbConnect from '@/lib/db';
import Branch from '@/models/Branch';
import { revalidatePath } from 'next/cache';

// CREATE Branch
export async function createBranch(formData) {
    const data = {
        name: formData.get('name'),
        code: formData.get('code') || undefined,
        address: formData.get('address') || undefined,
        contact: formData.get('contact') || undefined,
        email: formData.get('email') || undefined,
    };

    if (!data.name) {
        return { error: 'Branch name is required' };
    }

    try {
        await dbConnect();

        // Check for duplicate name
        const existing = await Branch.findOne({ name: data.name });
        if (existing) {
            return { error: 'Branch with this name already exists' };
        }

        const branch = await Branch.create(data);
        revalidatePath('/dashboard/branches');
        revalidatePath('/dashboard/students');
        return { success: true, branch: JSON.parse(JSON.stringify(branch)) };
    } catch (error) {
        console.error('Error creating branch:', error);
        if (error.code === 11000) {
            return { error: 'Branch code already exists' };
        }
        return { error: error.message || 'Failed to create branch' };
    }
}

// READ all Branches
export async function getBranches(includeInactive = false) {
    await dbConnect();

    const query = includeInactive ? {} : { isActive: true };
    const branches = await Branch.find(query).sort({ name: 1 }).lean();

    return branches.map(b => ({
        ...b,
        _id: b._id.toString(),
        createdAt: b.createdAt?.toISOString(),
        updatedAt: b.updatedAt?.toISOString(),
    }));
}

// READ single Branch by ID
export async function getBranchById(id) {
    await dbConnect();

    const branch = await Branch.findById(id).lean();
    if (!branch) {
        return null;
    }

    return {
        ...branch,
        _id: branch._id.toString(),
        createdAt: branch.createdAt?.toISOString(),
        updatedAt: branch.updatedAt?.toISOString(),
    };
}

// UPDATE Branch
export async function updateBranch(id, formData) {
    await dbConnect();

    const data = {};
    const fields = ['name', 'code', 'address', 'contact', 'email'];

    fields.forEach(field => {
        const value = formData.get(field);
        if (value !== null && value !== undefined) {
            data[field] = value || undefined;
        }
    });

    try {
        const branch = await Branch.findByIdAndUpdate(id, data, { new: true });
        if (!branch) {
            return { error: 'Branch not found' };
        }
        revalidatePath('/dashboard/branches');
        revalidatePath('/dashboard/students');
        return { success: true, branch: JSON.parse(JSON.stringify(branch)) };
    } catch (error) {
        console.error('Error updating branch:', error);
        if (error.code === 11000) {
            return { error: 'Branch name or code already exists' };
        }
        return { error: error.message || 'Failed to update branch' };
    }
}

// DELETE Branch (soft delete)
export async function deleteBranch(id) {
    await dbConnect();

    try {
        const branch = await Branch.findByIdAndUpdate(id, { isActive: false }, { new: true });
        if (!branch) {
            return { error: 'Branch not found' };
        }
        revalidatePath('/dashboard/branches');
        return { success: true };
    } catch (error) {
        console.error('Error deleting branch:', error);
        return { error: error.message || 'Failed to delete branch' };
    }
}

// Get branch count for dashboard
export async function getBranchCount() {
    await dbConnect();
    return await Branch.countDocuments({ isActive: true });
}
