'use server';

import dbConnect from '@/lib/db';
import { dateToISOString } from '@/lib/serialize';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/sql';
import { psql, querySql } from '@/lib/prismaSql';
import { buildFilterWhereSql, normalizeSortModel } from '@/lib/gridServer';

// Types for action results
interface ActionResult<T = unknown> {
    success?: boolean;
    error?: string;
    transport?: T;
}

interface TransportFilters {
    branchId?: string;
    search?: string;
    limit?: number;
}

interface TransportPageFilters extends TransportFilters {
    page?: number;
    pageSize?: number;
    sortModel?: unknown;
    filterModel?: unknown;
}

interface PaginatedResult<T> {
    rows: T[];
    total: number;
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

export async function createTransport(formData: FormData): Promise<ActionResult> {
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

        const vehicleNumber = String(data.vehicleNumber).toUpperCase();
        const existing = await sql<Array<{ id: string }>>`
            SELECT id FROM transports WHERE vehicle_number = ${vehicleNumber} LIMIT 1
        `;
        if (existing?.length) {
            return { error: 'Vehicle with this number already exists' };
        }

        const created = await sql<Array<{ id: string }>>`
            INSERT INTO transports (
                driver_name,
                driver_contact,
                route,
                vehicle_type,
                vehicle_number,
                capacity,
                branch_id,
                is_active,
                updated_at
            )
            VALUES (
                ${data.driverName},
                ${data.driverContact},
                ${data.route},
                ${data.vehicleType || ''},
                ${vehicleNumber},
                ${data.capacity ?? null},
                ${data.branchId || null}::uuid,
                true,
                NOW()
            )
            RETURNING id
        `;
        const transportId = created?.[0]?.id;
        revalidatePath('/dashboard/transport');
        return { success: true, transport: { id: transportId } };
    } catch (error) {
        const err = error as Error;
        const msg = String((err as any)?.message || 'Failed to create transport');
        if (msg.toLowerCase().includes('unique') && msg.toLowerCase().includes('vehicle')) {
            return { error: 'Vehicle number already exists' };
        }
        return { error: msg };
    }
}

export async function getTransports(filters: TransportFilters = {}): Promise<SerializedTransport[]> {
    await dbConnect();
    const branchId = filters.branchId || null;
    const search = (filters.search || '').trim() || null;
    const limit = filters.limit || 100;

    const rows = await sql<Array<{
        id: string;
        driver_name: string;
        driver_contact: string;
        route: string;
        vehicle_type: string;
        vehicle_number: string;
        capacity: number | null;
        branch_id: string | null;
        branch_name: string | null;
        is_active: boolean;
        created_at: string;
        updated_at: string;
    }>>`
        SELECT
            t.id,
            t.driver_name,
            t.driver_contact,
            t.route,
            t.vehicle_type,
            t.vehicle_number,
            t.capacity,
            t.branch_id,
            b.name AS branch_name,
            t.is_active,
            t.created_at,
            t.updated_at
        FROM transports t
        LEFT JOIN branches b ON b.id = t.branch_id
        WHERE t.is_active = true
          AND (${branchId}::uuid IS NULL OR t.branch_id = ${branchId}::uuid)
          AND (
            ${search}::text IS NULL OR
            t.driver_name ILIKE ('%' || ${search} || '%') OR
            t.route ILIKE ('%' || ${search} || '%') OR
            t.vehicle_number ILIKE ('%' || ${search} || '%')
          )
        ORDER BY t.route ASC
        LIMIT ${limit}
    `;

    return rows.map((t) => ({
        _id: t.id,
        driverName: t.driver_name,
        driverContact: t.driver_contact,
        route: t.route,
        vehicleType: t.vehicle_type,
        vehicleNumber: t.vehicle_number,
        capacity: t.capacity ?? undefined,
        branchId: t.branch_id,
        branchName: t.branch_name,
        isActive: t.is_active,
        createdAt: dateToISOString(t.created_at),
        updatedAt: dateToISOString(t.updated_at),
    }));
}

export async function getTransportsPage(filters: TransportPageFilters = {}): Promise<PaginatedResult<SerializedTransport>> {
    await dbConnect();
    const branchId = filters.branchId || null;
    const search = (filters.search || '').trim() || null;
    const safePage = Number.isFinite(Number(filters.page)) ? Math.max(0, Number(filters.page)) : 0;
    const safePageSize = Number.isFinite(Number(filters.pageSize)) ? Math.min(200, Math.max(5, Number(filters.pageSize))) : 25;
    const offset = safePage * safePageSize;
    const filterWhere = buildFilterWhereSql(filters.filterModel, {
        driver_route: { expr: psql`COALESCE(t.route,'')` },
        driver_name: { expr: psql`COALESCE(t.driver_name,'')` },
        driver_contact: { expr: psql`COALESCE(t.driver_contact,'')` },
        driver_car: { expr: psql`COALESCE(t.vehicle_type,'')` },
        driver_car_number: { expr: psql`COALESCE(t.vehicle_number,'')` },
        capacity: { expr: psql`t.capacity`, type: 'number' },
        branch_name: { expr: psql`COALESCE(b.name,'')` },
    });

    const sort = normalizeSortModel(filters.sortModel);
    const orderBy = (() => {
        const dir = sort?.direction === 'desc' ? psql`DESC` : psql`ASC`;
        if (sort?.field === 'driver_route') return psql`ORDER BY t.route ${dir}`;
        if (sort?.field === 'driver_name') return psql`ORDER BY t.driver_name ${dir}`;
        if (sort?.field === 'driver_contact') return psql`ORDER BY t.driver_contact ${dir} NULLS LAST`;
        if (sort?.field === 'driver_car') return psql`ORDER BY t.vehicle_type ${dir} NULLS LAST`;
        if (sort?.field === 'driver_car_number') return psql`ORDER BY t.vehicle_number ${dir}`;
        if (sort?.field === 'branch_name') return psql`ORDER BY b.name ${dir} NULLS LAST`;
        return psql`ORDER BY t.route ASC`;
    })();

    const countRows = await querySql<Array<{ total: number }>>(psql`
        SELECT COUNT(*)::int AS total
        FROM transports t
        LEFT JOIN branches b ON b.id = t.branch_id
        WHERE t.is_active = true
          AND (${branchId}::uuid IS NULL OR t.branch_id = ${branchId}::uuid)
          AND (
            ${search}::text IS NULL OR
            t.driver_name ILIKE ('%' || ${search} || '%') OR
            t.route ILIKE ('%' || ${search} || '%') OR
            t.vehicle_number ILIKE ('%' || ${search} || '%')
          )
          ${filterWhere}
    `);
    const total = countRows?.[0]?.total || 0;

    const rows = await querySql<Array<{
        id: string;
        driver_name: string;
        driver_contact: string;
        route: string;
        vehicle_type: string;
        vehicle_number: string;
        capacity: number | null;
        branch_id: string | null;
        branch_name: string | null;
        is_active: boolean;
        created_at: string;
        updated_at: string;
    }>>(psql`
        SELECT
            t.id,
            t.driver_name,
            t.driver_contact,
            t.route,
            t.vehicle_type,
            t.vehicle_number,
            t.capacity,
            t.branch_id,
            b.name AS branch_name,
            t.is_active,
            t.created_at,
            t.updated_at
        FROM transports t
        LEFT JOIN branches b ON b.id = t.branch_id
        WHERE t.is_active = true
          AND (${branchId}::uuid IS NULL OR t.branch_id = ${branchId}::uuid)
          AND (
            ${search}::text IS NULL OR
            t.driver_name ILIKE ('%' || ${search} || '%') OR
            t.route ILIKE ('%' || ${search} || '%') OR
            t.vehicle_number ILIKE ('%' || ${search} || '%')
          )
          ${filterWhere}
        ${orderBy}
        LIMIT ${safePageSize}
        OFFSET ${offset}
    `);

    const mapped = rows.map((t) => ({
        _id: t.id,
        driverName: t.driver_name,
        driverContact: t.driver_contact,
        route: t.route,
        vehicleType: t.vehicle_type,
        vehicleNumber: t.vehicle_number,
        capacity: t.capacity ?? undefined,
        branchId: t.branch_id,
        branchName: t.branch_name,
        isActive: t.is_active,
        createdAt: dateToISOString(t.created_at),
        updatedAt: dateToISOString(t.updated_at),
    }));

    return { rows: mapped, total };
}

export async function getTransportById(id: string): Promise<SerializedTransport | null> {
    await dbConnect();
    const rows = await sql<Array<{
        id: string;
        driver_name: string;
        driver_contact: string;
        route: string;
        vehicle_type: string;
        vehicle_number: string;
        capacity: number | null;
        branch_id: string | null;
        branch_name: string | null;
        is_active: boolean;
        created_at: string;
        updated_at: string;
    }>>`
        SELECT
            t.id,
            t.driver_name,
            t.driver_contact,
            t.route,
            t.vehicle_type,
            t.vehicle_number,
            t.capacity,
            t.branch_id,
            b.name AS branch_name,
            t.is_active,
            t.created_at,
            t.updated_at
        FROM transports t
        LEFT JOIN branches b ON b.id = t.branch_id
        WHERE t.id = ${id}
        LIMIT 1
    `;
    const t = rows?.[0];
    if (!t) return null;

    return {
        _id: t.id,
        driverName: t.driver_name,
        driverContact: t.driver_contact,
        route: t.route,
        vehicleType: t.vehicle_type,
        vehicleNumber: t.vehicle_number,
        capacity: t.capacity ?? undefined,
        branchId: t.branch_id,
        branchName: t.branch_name,
        isActive: t.is_active,
        createdAt: dateToISOString(t.created_at),
        updatedAt: dateToISOString(t.updated_at),
    };
}

export async function updateTransport(id: string, formData: FormData): Promise<ActionResult> {
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
        const hasDriverName = Object.prototype.hasOwnProperty.call(data, 'driverName');
        const hasDriverContact = Object.prototype.hasOwnProperty.call(data, 'driverContact');
        const hasRoute = Object.prototype.hasOwnProperty.call(data, 'route');
        const hasVehicleType = Object.prototype.hasOwnProperty.call(data, 'vehicleType');
        const hasVehicleNumber = Object.prototype.hasOwnProperty.call(data, 'vehicleNumber');
        const hasCapacity = Object.prototype.hasOwnProperty.call(data, 'capacity');
        const hasBranchId = Object.prototype.hasOwnProperty.call(data, 'branchId');

        const nextVehicleNumber = hasVehicleNumber ? String(data.vehicleNumber || '').toUpperCase() : null;

        const updated = await sql<Array<{ id: string }>>`
            UPDATE transports
            SET
                driver_name = CASE WHEN ${hasDriverName}::boolean THEN ${data.driverName as string} ELSE driver_name END,
                driver_contact = CASE WHEN ${hasDriverContact}::boolean THEN ${data.driverContact as string} ELSE driver_contact END,
                route = CASE WHEN ${hasRoute}::boolean THEN ${data.route as string} ELSE route END,
                vehicle_type = CASE WHEN ${hasVehicleType}::boolean THEN ${data.vehicleType as string} ELSE vehicle_type END,
                vehicle_number = CASE WHEN ${hasVehicleNumber}::boolean THEN ${nextVehicleNumber} ELSE vehicle_number END,
                capacity = CASE WHEN ${hasCapacity}::boolean THEN ${data.capacity as number | null} ELSE capacity END,
                branch_id = CASE WHEN ${hasBranchId}::boolean THEN ${((data.branchId as string | undefined) || null)}::uuid ELSE branch_id END,
                updated_at = NOW()
            WHERE id = ${id}::uuid
            RETURNING id
        `;
        if (!updated?.length) {
            return { error: 'Transport not found' };
        }
        revalidatePath('/dashboard/transport');
        return { success: true };
    } catch (error) {
        const err = error as Error;
        const msg = String((err as any)?.message || 'Failed to update transport');
        if (msg.toLowerCase().includes('unique') && msg.toLowerCase().includes('vehicle')) {
            return { error: 'Vehicle number already exists' };
        }
        return { error: msg };
    }
}

export async function deleteTransport(id: string): Promise<ActionResult> {
    await dbConnect();

    try {
        const updated = await sql<Array<{ id: string }>>`
            UPDATE transports SET is_active = false, updated_at = NOW()
            WHERE id = ${id}::uuid
            RETURNING id
        `;
        if (!updated?.length) {
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
    const rows = await sql<Array<{ total: number }>>`
        SELECT COUNT(*)::int AS total
        FROM transports
        WHERE is_active = true
          AND (${branchId}::uuid IS NULL OR branch_id = ${branchId}::uuid)
    `;
    return rows?.[0]?.total || 0;
}
