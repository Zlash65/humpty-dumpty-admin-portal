'use server';

import dbConnect from '@/lib/db';
import { dateToISOString, idToString, pickRefName } from '@/lib/serialize';
import Transport from '@/models/Transport';
import { revalidatePath } from 'next/cache';
import type { ITransportDocument } from '@/types';
import type { FilterQuery, Types } from 'mongoose';

// Types for action results
interface ActionResult<T = void> {
    success?: boolean;
    error?: string;
    transport?: T;
}

interface TransportFilters {
    branchId?: string;
    search?: string;
    limit?: number;
}

interface SerializedTransport {
    _id: string;
    driverName?: string;
    driverContact?: string;
    route?: string;
    vehicleType?: string;
    vehicleNumber?: string;
    capacity?: number;
    branchId: string | null;
    branchName: string | null;
    isActive?: boolean;
    createdAt: string | undefined;
    updatedAt: string | undefined;
}

interface MongoError extends Error {
    code?: number;
}

export async function createTransport(formData: FormData): Promise<ActionResult<ITransportDocument>> {
    const data = {
        driverName: formData.get('driverName') as string | null,
        driverContact: formData.get('driverContact') as string | null,
        route: formData.get('route') as string | null,
        vehicleType: formData.get('vehicleType') as string | null,
        vehicleNumber: formData.get('vehicleNumber') as string | null,
        capacity: parseInt(formData.get('capacity') as string) || undefined,
        branchId: (formData.get('branchId') as string | null) || undefined,
    };

    if (!data.driverName || !data.driverContact || !data.route || !data.vehicleType || !data.vehicleNumber) {
        return { error: 'All required fields must be filled' };
    }

    try {
        await dbConnect();

        const existing = await Transport.findOne({ vehicleNumber: data.vehicleNumber.toUpperCase() });
        if (existing) {
            return { error: 'Vehicle with this number already exists' };
        }

        const transport = await Transport.create(data);
        revalidatePath('/dashboard/transport');
        return { success: true, transport: JSON.parse(JSON.stringify(transport)) };
    } catch (error) {
        const err = error as MongoError;
        if (err.code === 11000) {
            return { error: 'Vehicle number already exists' };
        }
        return { error: err.message || 'Failed to create transport' };
    }
}

export async function getTransports(filters: TransportFilters = {}): Promise<SerializedTransport[]> {
    await dbConnect();

    interface TransportQuery {
        isActive: boolean;
        branchId?: string;
        $or?: Array<{ [key: string]: { $regex: string; $options: string } }>;
    }

    const query: TransportQuery = { isActive: true };

    if (filters.branchId) {
        query.branchId = filters.branchId;
    }

    if (filters.search) {
        query.$or = [
            { driverName: { $regex: filters.search, $options: 'i' } },
            { route: { $regex: filters.search, $options: 'i' } },
            { vehicleNumber: { $regex: filters.search, $options: 'i' } },
        ];
    }

    const transports = await Transport.find(query as FilterQuery<ITransportDocument>)
        .populate('branchId', 'name')
        .sort({ route: 1 })
        .limit(filters.limit || 100)
        .lean();

    interface PopulatedBranch {
        _id: Types.ObjectId;
        name?: string;
    }

    interface TransportLean {
        _id: Types.ObjectId;
        driverName?: string;
        driverContact?: string;
        route?: string;
        vehicleType?: string;
        vehicleNumber?: string;
        capacity?: number;
        branchId?: PopulatedBranch | Types.ObjectId;
        isActive?: boolean;
        createdAt?: Date;
        updatedAt?: Date;
    }

    return (transports as unknown as TransportLean[]).map(t => ({
        ...t,
        _id: idToString(t._id) || '',
        branchId: idToString(t.branchId),
        branchName: pickRefName(t.branchId as PopulatedBranch),
        createdAt: dateToISOString(t.createdAt),
        updatedAt: dateToISOString(t.updatedAt),
    }));
}

export async function getTransportById(id: string): Promise<SerializedTransport | null> {
    await dbConnect();

    const transport = await Transport.findById(id)
        .populate('branchId', 'name')
        .lean();

    if (!transport) {
        return null;
    }

    interface PopulatedBranch {
        _id: Types.ObjectId;
        name?: string;
    }

    interface TransportLean {
        _id: Types.ObjectId;
        driverName?: string;
        driverContact?: string;
        route?: string;
        vehicleType?: string;
        vehicleNumber?: string;
        capacity?: number;
        branchId?: PopulatedBranch | Types.ObjectId;
        isActive?: boolean;
        createdAt?: Date;
        updatedAt?: Date;
    }

    const t = transport as unknown as TransportLean;

    return {
        ...t,
        _id: idToString(t._id) || '',
        branchId: idToString(t.branchId),
        branchName: pickRefName(t.branchId as PopulatedBranch),
        createdAt: dateToISOString(t.createdAt),
        updatedAt: dateToISOString(t.updatedAt),
    };
}

export async function updateTransport(id: string, formData: FormData): Promise<ActionResult<ITransportDocument>> {
    await dbConnect();

    const data: Record<string, string | number | undefined> = {};
    const fields = ['driverName', 'driverContact', 'route', 'vehicleType', 'vehicleNumber', 'capacity', 'branchId'];

    fields.forEach(field => {
        const value = formData.get(field) as string | null;
        if (value !== null && value !== undefined) {
            if (field === 'capacity') {
                data[field] = parseInt(value) || undefined;
            } else {
                data[field] = value || undefined;
            }
        }
    });

    try {
        const transport = await Transport.findByIdAndUpdate(id, data, { new: true });
        if (!transport) {
            return { error: 'Transport not found' };
        }
        revalidatePath('/dashboard/transport');
        return { success: true, transport: JSON.parse(JSON.stringify(transport)) };
    } catch (error) {
        const err = error as MongoError;
        if (err.code === 11000) {
            return { error: 'Vehicle number already exists' };
        }
        return { error: err.message || 'Failed to update transport' };
    }
}

export async function deleteTransport(id: string): Promise<ActionResult> {
    await dbConnect();

    try {
        const transport = await Transport.findByIdAndUpdate(id, { isActive: false }, { new: true });
        if (!transport) {
            return { error: 'Transport not found' };
        }
        revalidatePath('/dashboard/transport');
        return { success: true };
    } catch (error) {
        const err = error as Error;
        return { error: err.message || 'Failed to delete transport' };
    }
}

export async function getTransportCount(branchId: string | null = null): Promise<number> {
    await dbConnect();

    interface CountQuery {
        isActive: boolean;
        branchId?: string;
    }

    const query: CountQuery = { isActive: true };
    if (branchId) {
        query.branchId = branchId;
    }

    return await Transport.countDocuments(query as FilterQuery<ITransportDocument>);
}
