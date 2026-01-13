'use server';

import dbConnect from '@/lib/db';
import { dateToISOString, idToString, pickRefName } from '@/lib/serialize';
import Transport from '@/models/Transport';
import { revalidatePath } from 'next/cache';

export async function createTransport(formData) {
    const data = {
        driverName: formData.get('driverName'),
        driverContact: formData.get('driverContact'),
        route: formData.get('route'),
        vehicleType: formData.get('vehicleType'),
        vehicleNumber: formData.get('vehicleNumber'),
        capacity: parseInt(formData.get('capacity')) || undefined,
        branchId: formData.get('branchId') || undefined,
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
        console.error('Error creating transport:', error);
        if (error.code === 11000) {
            return { error: 'Vehicle number already exists' };
        }
        return { error: error.message || 'Failed to create transport' };
    }
}

export async function getTransports(filters = {}) {
    await dbConnect();

    const query = { isActive: true };

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

    const transports = await Transport.find(query)
        .populate('branchId', 'name')
        .sort({ route: 1 })
        .limit(filters.limit || 100)
        .lean();

    return transports.map(t => ({
        ...t,
        _id: idToString(t._id),
        branchId: idToString(t.branchId),
        branchName: pickRefName(t.branchId),
        createdAt: dateToISOString(t.createdAt),
        updatedAt: dateToISOString(t.updatedAt),
    }));
}

export async function getTransportById(id) {
    await dbConnect();

    const transport = await Transport.findById(id)
        .populate('branchId', 'name')
        .lean();

    if (!transport) {
        return null;
    }

    return {
        ...transport,
        _id: idToString(transport._id),
        branchId: idToString(transport.branchId),
        branchName: pickRefName(transport.branchId),
        createdAt: dateToISOString(transport.createdAt),
        updatedAt: dateToISOString(transport.updatedAt),
    };
}

export async function updateTransport(id, formData) {
    await dbConnect();

    const data = {};
    const fields = ['driverName', 'driverContact', 'route', 'vehicleType', 'vehicleNumber', 'capacity', 'branchId'];

    fields.forEach(field => {
        const value = formData.get(field);
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
        console.error('Error updating transport:', error);
        if (error.code === 11000) {
            return { error: 'Vehicle number already exists' };
        }
        return { error: error.message || 'Failed to update transport' };
    }
}

export async function deleteTransport(id) {
    await dbConnect();

    try {
        const transport = await Transport.findByIdAndUpdate(id, { isActive: false }, { new: true });
        if (!transport) {
            return { error: 'Transport not found' };
        }
        revalidatePath('/dashboard/transport');
        return { success: true };
    } catch (error) {
        console.error('Error deleting transport:', error);
        return { error: error.message || 'Failed to delete transport' };
    }
}

export async function getTransportCount(branchId = null) {
    await dbConnect();

    const query = { isActive: true };
    if (branchId) {
        query.branchId = branchId;
    }

    return await Transport.countDocuments(query);
}
