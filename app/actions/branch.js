'use server';

import dbConnect from '@/lib/db';
import { dateToISOString, idToString } from '@/lib/serialize';
import Branch from '@/models/Branch';
import { revalidatePath } from 'next/cache';

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
        if (error.code === 11000) {
            return { error: 'Branch code already exists' };
        }
        return { error: error.message || 'Failed to create branch' };
    }
}

export async function getBranches(includeInactive = false) {
    await dbConnect();

    const query = includeInactive ? {} : { isActive: true };
    const branches = await Branch.find(query).sort({ name: 1 }).lean();

    return branches.map(b => ({
        ...b,
        _id: idToString(b._id),
        createdAt: dateToISOString(b.createdAt),
        updatedAt: dateToISOString(b.updatedAt),
    }));
}

export async function getBranchById(id) {
    await dbConnect();

    const branch = await Branch.findById(id).lean();
    if (!branch) {
        return null;
    }

    return {
        ...branch,
        _id: idToString(branch._id),
        createdAt: dateToISOString(branch.createdAt),
        updatedAt: dateToISOString(branch.updatedAt),
    };
}

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
        if (error.code === 11000) {
            return { error: 'Branch name or code already exists' };
        }
        return { error: error.message || 'Failed to update branch' };
    }
}

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
        return { error: error.message || 'Failed to delete branch' };
    }
}

export async function getBranchCount() {
    await dbConnect();
    return await Branch.countDocuments({ isActive: true });
}
