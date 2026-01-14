'use server';

import dbConnect from '@/lib/db';
import { dateToISOString, idToString, pickRefName } from '@/lib/serialize';
import Staff from '@/models/Staff';
import { revalidatePath } from 'next/cache';
import type { IStaffDocument, StaffType } from '@/types';
import type { FilterQuery, Types } from 'mongoose';

// Types for action results
interface ActionResult<T = void> {
    success?: boolean;
    error?: string;
    staff?: T;
}

interface StaffFilters {
    branchId?: string;
    staffType?: StaffType;
    search?: string;
    limit?: number;
}

interface SerializedAssignment {
    classEntryId: string | null;
    branchId: string | null;
    className: string;
    shiftName: string;
    division: string;
}

interface SerializedStaff {
    _id: string;
    name?: string;
    contact?: string;
    email?: string;
    staffType?: string;
    role?: string;
    branchId: string | null;
    branchName: string | null;
    assignments: SerializedAssignment[];
    isActive?: boolean;
    createdAt: string | undefined;
    updatedAt: string | undefined;
}

interface AssignmentInput {
    classEntryId?: string | Types.ObjectId;
    branchId?: string | Types.ObjectId;
    className?: string;
    class_name?: string;
    shiftName?: string;
    shift_name?: string;
    division?: string;
}

export async function createStaff(formData: FormData): Promise<ActionResult<IStaffDocument>> {
    interface StaffCreateData {
        name: string | null;
        contact?: string;
        email?: string;
        staffType: StaffType;
        role?: string;
        branchId?: string;
        assignments?: AssignmentInput[];
    }

    const data: StaffCreateData = {
        name: formData.get('name') as string | null,
        contact: (formData.get('contact') as string | null) || undefined,
        email: (formData.get('email') as string | null) || undefined,
        staffType: ((formData.get('staffType') as string | null) || 'office') as StaffType,
        role: (formData.get('role') as string | null) || undefined,
        branchId: (formData.get('branchId') as string | null) || undefined,
    };

    // Parse assignments for teachers
    const assignmentsJson = formData.get('assignments') as string | null;
    if (assignmentsJson && data.staffType === 'teacher') {
        try {
            const parsed = JSON.parse(assignmentsJson);
            data.assignments = Array.isArray(parsed) ? parsed : [];
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

    // Electron parity: teachers must have at least one class assignment.
    if (data.staffType === 'teacher' && (!Array.isArray(data.assignments) || data.assignments.length === 0)) {
        return { error: 'Teachers must have at least one class assignment' };
    }

    try {
        await dbConnect();
        const staff = await Staff.create(data);
        revalidatePath('/dashboard/staff');
        return { success: true, staff: JSON.parse(JSON.stringify(staff)) };
    } catch (error) {
        const err = error as Error;
        return { error: err.message || 'Failed to create staff' };
    }
}

export async function getStaff(filters: StaffFilters = {}): Promise<SerializedStaff[]> {
    await dbConnect();

    interface StaffQuery {
        isActive: boolean;
        branchId?: string;
        staffType?: StaffType;
        $or?: Array<{ [key: string]: { $regex: string; $options: string } }>;
    }

    const query: StaffQuery = { isActive: true };

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

    const staff = await Staff.find(query as FilterQuery<IStaffDocument>)
        .populate('branchId', 'name')
        .sort({ name: 1 })
        .limit(filters.limit || 100)
        .lean();

    interface PopulatedBranch {
        _id: Types.ObjectId;
        name?: string;
    }

    interface StaffLean {
        _id: Types.ObjectId;
        name?: string;
        contact?: string;
        email?: string;
        staffType?: string;
        role?: string;
        branchId?: PopulatedBranch | Types.ObjectId;
        assignments?: AssignmentInput[];
        isActive?: boolean;
        createdAt?: Date;
        updatedAt?: Date;
    }

    return (staff as unknown as StaffLean[]).map(s => ({
        ...s,
        _id: idToString(s._id) || '',
        branchId: idToString(s.branchId),
        branchName: pickRefName(s.branchId as PopulatedBranch),
        // Next.js Server->Client boundary requires plain objects only.
        // Mongoose subdocuments include ObjectId `_id` fields, which are not serializable.
        assignments: (s.assignments || []).map((a): SerializedAssignment => ({
            classEntryId: idToString(a?.classEntryId),
            branchId: idToString(a?.branchId),
            className: a?.className ?? a?.class_name ?? '',
            shiftName: a?.shiftName ?? a?.shift_name ?? '',
            division: a?.division ?? '',
        })),
        createdAt: dateToISOString(s.createdAt),
        updatedAt: dateToISOString(s.updatedAt),
    }));
}

export async function getStaffById(id: string): Promise<SerializedStaff | null> {
    await dbConnect();

    const staff = await Staff.findById(id)
        .populate('branchId', 'name')
        .lean();

    if (!staff) {
        return null;
    }

    interface PopulatedBranch {
        _id: Types.ObjectId;
        name?: string;
    }

    interface StaffLean {
        _id: Types.ObjectId;
        name?: string;
        contact?: string;
        email?: string;
        staffType?: string;
        role?: string;
        branchId?: PopulatedBranch | Types.ObjectId;
        assignments?: AssignmentInput[];
        isActive?: boolean;
        createdAt?: Date;
        updatedAt?: Date;
    }

    const s = staff as unknown as StaffLean;

    return {
        ...s,
        _id: idToString(s._id) || '',
        branchId: idToString(s.branchId),
        branchName: pickRefName(s.branchId as PopulatedBranch),
        assignments: (s.assignments || []).map((a): SerializedAssignment => ({
            classEntryId: idToString(a?.classEntryId),
            branchId: idToString(a?.branchId),
            className: a?.className ?? a?.class_name ?? '',
            shiftName: a?.shiftName ?? a?.shift_name ?? '',
            division: a?.division ?? '',
        })),
        createdAt: dateToISOString(s.createdAt),
        updatedAt: dateToISOString(s.updatedAt),
    };
}

export async function updateStaff(id: string, formData: FormData): Promise<ActionResult<IStaffDocument>> {
    await dbConnect();

    const data: Record<string, string | undefined | AssignmentInput[]> = {};
    const fields = ['name', 'contact', 'email', 'staffType', 'role', 'branchId'];

    fields.forEach(field => {
        const value = formData.get(field) as string | null;
        if (value !== null && value !== undefined) {
            data[field] = value || undefined;
        }
    });

    // Parse assignments for teachers
    const assignmentsJson = formData.get('assignments') as string | null;
    if (assignmentsJson) {
        try {
            const parsed = JSON.parse(assignmentsJson);
            data.assignments = Array.isArray(parsed) ? parsed : [];
        } catch {
            // Keep existing assignments if parsing fails
        }
    }

    try {
        // If switching to teacher, enforce assignment presence (Electron parity).
        if (data.staffType === 'teacher' && Object.prototype.hasOwnProperty.call(data, 'assignments')) {
            if (!Array.isArray(data.assignments) || data.assignments.length === 0) {
                return { error: 'Teachers must have at least one class assignment' };
            }
        }
        const staff = await Staff.findByIdAndUpdate(id, data, { new: true });
        if (!staff) {
            return { error: 'Staff not found' };
        }
        revalidatePath('/dashboard/staff');
        return { success: true, staff: JSON.parse(JSON.stringify(staff)) };
    } catch (error) {
        const err = error as Error;
        return { error: err.message || 'Failed to update staff' };
    }
}

export async function deleteStaff(id: string): Promise<ActionResult> {
    await dbConnect();

    try {
        const staff = await Staff.findByIdAndUpdate(id, { isActive: false }, { new: true });
        if (!staff) {
            return { error: 'Staff not found' };
        }
        revalidatePath('/dashboard/staff');
        return { success: true };
    } catch (error) {
        const err = error as Error;
        return { error: err.message || 'Failed to delete staff' };
    }
}

interface SearchStaffResult {
    _id: string;
    name?: string;
    contact?: string;
    email?: string;
    staffType?: string;
    role?: string;
    isActive?: boolean;
}

export async function searchStaff(query: string, branchId: string | null = null, limit: number = 50): Promise<SearchStaffResult[]> {
    await dbConnect();

    interface SearchQuery {
        isActive: boolean;
        $or: Array<{ [key: string]: { $regex: string; $options: string } }>;
        branchId?: string;
    }

    const searchQuery: SearchQuery = {
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

    const staff = await Staff.find(searchQuery as FilterQuery<IStaffDocument>)
        .limit(limit)
        .lean();

    interface StaffLean {
        _id: Types.ObjectId;
        name?: string;
        contact?: string;
        email?: string;
        staffType?: string;
        role?: string;
        isActive?: boolean;
    }

    return (staff as unknown as StaffLean[]).map(s => ({
        ...s,
        _id: idToString(s._id) || '',
    }));
}

export async function getStaffCount(branchId: string | null = null): Promise<number> {
    await dbConnect();

    interface CountQuery {
        isActive: boolean;
        branchId?: string;
    }

    const query: CountQuery = { isActive: true };
    if (branchId) {
        query.branchId = branchId;
    }

    return await Staff.countDocuments(query as FilterQuery<IStaffDocument>);
}

export async function getTeacherCount(branchId: string | null = null): Promise<number> {
    await dbConnect();

    interface CountQuery {
        isActive: boolean;
        staffType: StaffType;
        branchId?: string;
    }

    const query: CountQuery = { isActive: true, staffType: 'teacher' };
    if (branchId) {
        query.branchId = branchId;
    }

    return await Staff.countDocuments(query as FilterQuery<IStaffDocument>);
}
