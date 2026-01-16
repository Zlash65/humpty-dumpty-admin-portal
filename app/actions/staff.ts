'use server';

import dbConnect from '@/lib/db';
import { dateToISOString } from '@/lib/serialize';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/sql';
import { psql, querySql } from '@/lib/prismaSql';
import { buildFilterWhereSql, normalizeSortModel } from '@/lib/gridServer';
import { uiShiftFromDb } from '@/lib/shifts';
import { buildLooseSearchWhereSql } from '@/lib/searchSql';

// Types for action results
interface ActionResult<T = unknown> {
    success?: boolean;
    error?: string;
    staff?: T;
}

export type StaffType = 'office' | 'teacher';

interface StaffFilters {
    branchId?: string;
    staffType?: StaffType;
    search?: string;
}

interface StaffPageFilters extends StaffFilters {
    page?: number;
    pageSize?: number;
    sortModel?: unknown;
    filterModel?: unknown;
}

interface PaginatedResult<T> {
    rows: T[];
    total: number;
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
    classEntryId?: string;
    branchId?: string;
    className?: string;
    class_name?: string;
    shiftName?: string;
    shift_name?: string;
    division?: string;
}

function normalizeAssignments(assignments: unknown): SerializedAssignment[] {
    const assignmentsRaw = Array.isArray(assignments) ? (assignments as any[]) : [];
    return assignmentsRaw.map((a): SerializedAssignment => ({
        classEntryId: a?.classEntryId ? String(a.classEntryId) : null,
        branchId: a?.branchId ? String(a.branchId) : null,
        className: a?.className ?? a?.class_name ?? '',
        shiftName: uiShiftFromDb(a?.shiftName ?? a?.shift_name ?? ''),
        division: a?.division ?? '',
    }));
}

export async function createStaff(formData: FormData): Promise<ActionResult> {
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
        const assignments = data.staffType === 'teacher' ? (data.assignments || []) : [];
        const created = await sql<Array<{ id: string }>>`
            INSERT INTO staff (name, contact, email, staff_type, role, branch_id, assignments, is_active, updated_at)
            VALUES (
                ${data.name},
                ${data.contact || null},
                ${data.email || null},
                ${data.staffType},
                ${data.role || null},
                ${data.branchId || null}::uuid,
                ${JSON.stringify(assignments)}::jsonb,
                true,
                NOW()
            )
            RETURNING id
        `;
        const staffId = created?.[0]?.id;
        revalidatePath('/dashboard/staff');
        return { success: true, staff: { id: staffId } };
    } catch (error) {
        const err = error as Error;
        return { error: err.message || 'Failed to create staff' };
    }
}

export async function getStaffById(id: string): Promise<SerializedStaff | null> {
    const staffId = String(id || '').trim();
    if (!staffId) return null;
    await dbConnect();

    const rows = await sql<Array<{
        id: string;
        name: string;
        contact: string | null;
        email: string | null;
        staff_type: string;
        role: string | null;
        branch_id: string | null;
        branch_name: string | null;
        assignments: unknown;
        is_active: boolean;
        created_at: string;
        updated_at: string;
    }>>`
        SELECT
            s.id,
            s.name,
            s.contact,
            s.email,
            s.staff_type,
            s.role,
            s.branch_id,
            b.name AS branch_name,
            s.assignments,
            s.is_active,
            s.created_at,
            s.updated_at
        FROM staff s
        LEFT JOIN branches b ON b.id = s.branch_id
        WHERE s.id = ${staffId}::uuid
          AND s.is_active = true
        LIMIT 1
    `;
    const s = rows?.[0];
    if (!s) return null;

    return {
        _id: s.id,
        name: s.name,
        contact: s.contact || undefined,
        email: s.email || undefined,
        staffType: s.staff_type,
        role: s.role || undefined,
        branchId: s.branch_id,
        branchName: s.branch_name,
        assignments: normalizeAssignments(s.assignments),
        isActive: s.is_active,
        createdAt: dateToISOString(s.created_at),
        updatedAt: dateToISOString(s.updated_at),
    };
}

export async function getStaffOptionById(id: string): Promise<{ value: string; label: string; keywords?: string } | null> {
    const staffId = String(id || '').trim();
    if (!staffId) return null;
    await dbConnect();

    const rows = await sql<Array<{ id: string; name: string; contact: string | null }>>`
        SELECT id, name, contact
        FROM staff
        WHERE id = ${staffId}::uuid
          AND is_active = true
        LIMIT 1
    `;
    const s = rows?.[0];
    if (!s) return null;
    const keywords = [s.name, s.contact || ''].filter(Boolean).join(' ');
    return { value: s.id, label: s.name, keywords };
}

export async function searchStaffOptions({
    query,
    staffType,
    branchId,
    limit = 25,
}: {
    query: string;
    staffType?: StaffType;
    branchId?: string | null;
    limit?: number;
}): Promise<Array<{ value: string; label: string; keywords?: string }>> {
    await dbConnect();

    const q = String(query || '').trim();
    if (!q || q.length < 2) return [];
    const safeLimit = Math.min(50, Math.max(5, Number(limit) || 25));
    const type = staffType ?? null;
    const bId = branchId ?? null;

    const searchWhere = buildLooseSearchWhereSql({
        query: q,
        fields: [
            psql`COALESCE(name,'')`,
            psql`COALESCE(contact,'')`,
            psql`COALESCE(email,'')`,
            psql`COALESCE(role,'')`,
            psql`COALESCE(staff_type,'')`,
        ],
    });

    const rows = await sql<Array<{ id: string; name: string; contact: string | null; role: string | null }>>`
        SELECT id, name, contact, role
        FROM staff
        WHERE is_active = true
          AND (${type}::text IS NULL OR staff_type = ${type})
          AND (${bId}::uuid IS NULL OR branch_id = ${bId}::uuid)
          ${searchWhere}
        ORDER BY name ASC
        LIMIT ${safeLimit}
    `;

    return (rows || []).map((r) => ({
        value: r.id,
        label: r.name,
        keywords: [r.name, r.contact || '', r.role || ''].filter(Boolean).join(' '),
    }));
}

export async function getStaffPage(filters: StaffPageFilters = {}): Promise<PaginatedResult<SerializedStaff>> {
    await dbConnect();
    const branchId = filters.branchId || null;
    const staffType = filters.staffType || null;
    const search = (filters.search || '').trim();
    const safePage = Number.isFinite(Number(filters.page)) ? Math.max(0, Number(filters.page)) : 0;
    const safePageSize = Number.isFinite(Number(filters.pageSize)) ? Math.min(200, Math.max(5, Number(filters.pageSize))) : 25;
    const offset = safePage * safePageSize;

    const searchWhere = buildLooseSearchWhereSql({
        query: search,
        fields: [
            psql`COALESCE(s.name,'')`,
            psql`COALESCE(s.contact,'')`,
            psql`COALESCE(s.email,'')`,
            psql`COALESCE(s.staff_type,'')`,
            psql`COALESCE(s.role,'')`,
            psql`COALESCE(b.name,'')`,
        ],
    });
    const filterWhere = buildFilterWhereSql(filters.filterModel, {
        name: { expr: psql`COALESCE(s.name,'')` },
        contact: { expr: psql`COALESCE(s.contact,'')` },
        email: { expr: psql`COALESCE(s.email,'')` },
        staff_type: { expr: psql`COALESCE(s.staff_type,'')` },
        role: { expr: psql`COALESCE(s.role,'')` },
        branch_name: { expr: psql`COALESCE(b.name,'')` },
    });

    const sort = normalizeSortModel(filters.sortModel);
    const orderBy = (() => {
        const dir = sort?.direction === 'desc' ? psql`DESC` : psql`ASC`;
        if (sort?.field === 'name') return psql`ORDER BY s.name ${dir}`;
        if (sort?.field === 'contact') return psql`ORDER BY s.contact ${dir} NULLS LAST`;
        if (sort?.field === 'email') return psql`ORDER BY s.email ${dir} NULLS LAST`;
        if (sort?.field === 'staff_type') return psql`ORDER BY s.staff_type ${dir}`;
        if (sort?.field === 'role') return psql`ORDER BY s.role ${dir} NULLS LAST`;
        if (sort?.field === 'branch_name') return psql`ORDER BY b.name ${dir} NULLS LAST`;
        return psql`ORDER BY s.name ASC`;
    })();

    const countRows = await querySql<Array<{ total: number }>>(psql`
        SELECT COUNT(*)::int AS total
        FROM staff s
        LEFT JOIN branches b ON b.id = s.branch_id
        WHERE s.is_active = true
          AND (${branchId}::uuid IS NULL OR s.branch_id = ${branchId}::uuid)
          AND (${staffType}::text IS NULL OR s.staff_type = ${staffType})
          ${searchWhere}
          ${filterWhere}
    `);
    const total = countRows?.[0]?.total || 0;

    const rows = await querySql<Array<{
        id: string;
        name: string;
        contact: string | null;
        email: string | null;
        staff_type: string;
        role: string | null;
        branch_id: string | null;
        branch_name: string | null;
        assignments: unknown;
        is_active: boolean;
        created_at: string;
        updated_at: string;
    }>>(psql`
        SELECT
            s.id,
            s.name,
            s.contact,
            s.email,
            s.staff_type,
            s.role,
            s.branch_id,
            b.name AS branch_name,
            s.assignments,
            s.is_active,
            s.created_at,
            s.updated_at
        FROM staff s
        LEFT JOIN branches b ON b.id = s.branch_id
        WHERE s.is_active = true
          AND (${branchId}::uuid IS NULL OR s.branch_id = ${branchId}::uuid)
          AND (${staffType}::text IS NULL OR s.staff_type = ${staffType})
          ${searchWhere}
          ${filterWhere}
        ${orderBy}
        LIMIT ${safePageSize}
        OFFSET ${offset}
    `);

    const mapped = rows.map((s) => {
        const assignmentsRaw = Array.isArray(s.assignments) ? (s.assignments as any[]) : [];
        const assignments = assignmentsRaw.map((a): SerializedAssignment => ({
            classEntryId: a?.classEntryId ? String(a.classEntryId) : null,
            branchId: a?.branchId ? String(a.branchId) : null,
            className: a?.className ?? a?.class_name ?? '',
            shiftName: uiShiftFromDb(a?.shiftName ?? a?.shift_name ?? ''),
            division: a?.division ?? '',
        }));

        return {
            _id: s.id,
            name: s.name,
            contact: s.contact || undefined,
            email: s.email || undefined,
            staffType: s.staff_type,
            role: s.role || undefined,
            branchId: s.branch_id,
            branchName: s.branch_name,
            assignments,
            isActive: s.is_active,
            createdAt: dateToISOString(s.created_at),
            updatedAt: dateToISOString(s.updated_at),
        };
    });

    return { rows: mapped, total };
}

export async function updateStaff(id: string, formData: FormData): Promise<ActionResult> {
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
        const hasName = Object.prototype.hasOwnProperty.call(data, 'name');
        const hasContact = Object.prototype.hasOwnProperty.call(data, 'contact');
        const hasEmail = Object.prototype.hasOwnProperty.call(data, 'email');
        const hasStaffType = Object.prototype.hasOwnProperty.call(data, 'staffType');
        const hasRole = Object.prototype.hasOwnProperty.call(data, 'role');
        const hasBranchId = Object.prototype.hasOwnProperty.call(data, 'branchId');
        const hasAssignments = Object.prototype.hasOwnProperty.call(data, 'assignments');

        const updated = await sql<Array<{ id: string }>>`
            UPDATE staff
            SET
                name = CASE WHEN ${hasName}::boolean THEN ${data.name as string} ELSE name END,
                contact = CASE WHEN ${hasContact}::boolean THEN ${data.contact as string | null} ELSE contact END,
                email = CASE WHEN ${hasEmail}::boolean THEN ${data.email as string | null} ELSE email END,
                staff_type = CASE WHEN ${hasStaffType}::boolean THEN ${data.staffType as string} ELSE staff_type END,
                role = CASE WHEN ${hasRole}::boolean THEN ${data.role as string | null} ELSE role END,
                branch_id = CASE WHEN ${hasBranchId}::boolean THEN ${((data.branchId as string | undefined) || null)}::uuid ELSE branch_id END,
                assignments = CASE WHEN ${hasAssignments}::boolean THEN ${JSON.stringify(data.assignments || [])}::jsonb ELSE assignments END,
                updated_at = NOW()
            WHERE id = ${id}::uuid
            RETURNING id
        `;
        if (!updated?.length) {
            return { error: 'Staff not found' };
        }
        revalidatePath('/dashboard/staff');
        return { success: true };
    } catch (error) {
        const err = error as Error;
        return { error: err.message || 'Failed to update staff' };
    }
}

export async function deleteStaff(id: string): Promise<ActionResult> {
    await dbConnect();

    try {
        const updated = await sql<Array<{ id: string }>>`
            UPDATE staff SET is_active = false, updated_at = NOW()
            WHERE id = ${id}::uuid
            RETURNING id
        `;
        if (!updated?.length) {
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
    const q = (query || '').trim();
    if (!q) return [];

    const searchWhere = buildLooseSearchWhereSql({
        query: q,
        fields: [
            psql`COALESCE(name,'')`,
            psql`COALESCE(contact,'')`,
            psql`COALESCE(email,'')`,
            psql`COALESCE(role,'')`,
            psql`COALESCE(staff_type,'')`,
        ],
    });

    const rows = await sql<Array<{
        id: string;
        name: string;
        contact: string | null;
        email: string | null;
        staff_type: string;
        role: string | null;
        is_active: boolean;
    }>>`
        SELECT id, name, contact, email, staff_type, role, is_active
        FROM staff
        WHERE is_active = true
          AND (${branchId}::uuid IS NULL OR branch_id = ${branchId}::uuid)
          ${searchWhere}
        ORDER BY name ASC
        LIMIT ${limit}
    `;

    return rows.map((s) => ({
        _id: s.id,
        name: s.name,
        contact: s.contact || undefined,
        email: s.email || undefined,
        staffType: s.staff_type,
        role: s.role || undefined,
        isActive: s.is_active,
    }));
}

export async function getStaffCount(branchId: string | null = null): Promise<number> {
    await dbConnect();
    const rows = await sql<Array<{ total: number }>>`
        SELECT COUNT(*)::int AS total
        FROM staff
        WHERE is_active = true AND (${branchId}::uuid IS NULL OR branch_id = ${branchId}::uuid)
    `;
    return rows?.[0]?.total || 0;
}

export async function getTeacherCount(branchId: string | null = null): Promise<number> {
    await dbConnect();
    const rows = await sql<Array<{ total: number }>>`
        SELECT COUNT(*)::int AS total
        FROM staff
        WHERE is_active = true
          AND staff_type = 'teacher'
          AND (${branchId}::uuid IS NULL OR branch_id = ${branchId}::uuid)
    `;
    return rows?.[0]?.total || 0;
}
