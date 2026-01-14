'use server';

import dbConnect from '@/lib/db';
import { dateToISOString, idToString } from '@/lib/serialize';
import Branch from '@/models/Branch';
import { revalidatePath } from 'next/cache';
import type { IBranchDocument } from '@/types';
import type { FilterQuery, Types } from 'mongoose';

// Types for action results
interface ActionResult<T = void> {
    success?: boolean;
    error?: string;
    branch?: T;
}

interface SerializedBranch {
    _id: string;
    name?: string;
    code?: string;
    address?: string;
    contact?: string;
    email?: string;
    isActive?: boolean;
    createdAt: string | undefined;
    updatedAt: string | undefined;
}

interface MongoError extends Error {
    code?: number;
}

export async function createBranch(formData: FormData): Promise<ActionResult<IBranchDocument>> {
    const data = {
        name: formData.get('name') as string | null,
        code: (formData.get('code') as string | null) || undefined,
        address: (formData.get('address') as string | null) || undefined,
        contact: (formData.get('contact') as string | null) || undefined,
        email: (formData.get('email') as string | null) || undefined,
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
        const err = error as MongoError;
        if (err.code === 11000) {
            return { error: 'Branch code already exists' };
        }
        return { error: err.message || 'Failed to create branch' };
    }
}

export async function getBranches(includeInactive: boolean = false): Promise<SerializedBranch[]> {
    await dbConnect();

    const query = includeInactive ? {} : { isActive: true };
    const branches = await Branch.find(query).sort({ name: 1 }).lean();

    interface BranchLean {
        _id: Types.ObjectId;
        name?: string;
        code?: string;
        address?: string;
        contact?: string;
        email?: string;
        isActive?: boolean;
        createdAt?: Date;
        updatedAt?: Date;
    }

    return (branches as unknown as BranchLean[]).map(b => ({
        ...b,
        _id: idToString(b._id) || '',
        createdAt: dateToISOString(b.createdAt),
        updatedAt: dateToISOString(b.updatedAt),
    }));
}

export async function getBranchById(id: string): Promise<SerializedBranch | null> {
    await dbConnect();

    const branch = await Branch.findById(id).lean();
    if (!branch) {
        return null;
    }

    interface BranchLean {
        _id: Types.ObjectId;
        name?: string;
        code?: string;
        address?: string;
        contact?: string;
        email?: string;
        isActive?: boolean;
        createdAt?: Date;
        updatedAt?: Date;
    }

    const b = branch as unknown as BranchLean;

    return {
        ...b,
        _id: idToString(b._id) || '',
        createdAt: dateToISOString(b.createdAt),
        updatedAt: dateToISOString(b.updatedAt),
    };
}

export async function updateBranch(id: string, formData: FormData): Promise<ActionResult<IBranchDocument>> {
    await dbConnect();

    const data: Record<string, string | undefined> = {};
    const fields = ['name', 'code', 'address', 'contact', 'email'];

    fields.forEach(field => {
        const value = formData.get(field) as string | null;
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
        const err = error as MongoError;
        if (err.code === 11000) {
            return { error: 'Branch name or code already exists' };
        }
        return { error: err.message || 'Failed to update branch' };
    }
}

export async function deleteBranch(id: string): Promise<ActionResult> {
    await dbConnect();

    try {
        const branch = await Branch.findByIdAndUpdate(id, { isActive: false }, { new: true });
        if (!branch) {
            return { error: 'Branch not found' };
        }
        revalidatePath('/dashboard/branches');
        return { success: true };
    } catch (error) {
        const err = error as Error;
        return { error: err.message || 'Failed to delete branch' };
    }
}

export async function getBranchCount(): Promise<number> {
    await dbConnect();
    return await Branch.countDocuments({ isActive: true } as FilterQuery<IBranchDocument>);
}
