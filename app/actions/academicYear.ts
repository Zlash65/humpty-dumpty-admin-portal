'use server';

import dbConnect from '@/lib/db';
import { dateToISOString } from '@/lib/serialize';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/sql';
import { psql, querySql } from '@/lib/prismaSql';
import { buildFilterWhereSql, normalizeSortModel } from '@/lib/gridServer';
import { buildLooseSearchWhereSql } from '@/lib/searchSql';
import { parseDateOnlyInput } from '@/lib/dateInput';

// Types for action results
interface ActionResult {
    success?: boolean;
    error?: string;
}

interface SerializedAcademicYear {
    _id: string;
    name?: string;
    startDate: string | undefined;
    endDate: string | undefined;
    isActive?: boolean;
    isLocked?: boolean;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
}

interface AcademicYearsPageFilters {
    search?: string;
    page?: number;
    pageSize?: number;
    sortModel?: unknown;
    filterModel?: unknown;
}

interface PaginatedResult<T> {
    rows: T[];
    total: number;
}

export async function createAcademicYear(formData: FormData): Promise<ActionResult> {
    const name = formData.get('name') as string | null;
    const startDate = formData.get('startDate') as string | null;
    const endDate = formData.get('endDate') as string | null;

    if (!name || !startDate || !endDate) {
        return { error: 'All fields are required' };
    }

    const startDateOnly = parseDateOnlyInput(startDate);
    if (!startDateOnly) return { error: 'Invalid Start Date' };
    const endDateOnly = parseDateOnlyInput(endDate);
    if (!endDateOnly) return { error: 'Invalid End Date' };

    if (endDateOnly < startDateOnly) {
        return { error: 'End Date must be on or after Start Date' };
    }

    try {
        await dbConnect();

        const existing = await sql<Array<{ id: string }>>`
            SELECT id FROM academic_years WHERE name = ${name} LIMIT 1
        `;
        if (existing?.length) {
            return { error: 'Academic Year with this name already exists' };
        }

        const created = await sql<Array<{ id: string }>>`
            INSERT INTO academic_years (name, start_date, end_date, is_active, is_locked)
            VALUES (${name}, ${startDateOnly}::date, ${endDateOnly}::date, false, false)
            RETURNING id
        `;
        const newYearId = created?.[0]?.id;
        if (!newYearId) return { error: 'Failed to create Academic Year' };

        // Electron parity: class/fee structure configuration does not disappear when adding a new year.
        // Our data model scopes FeeStructure by academicYearId, so copy forward from the currently active year
        // (or most recent year) so the new year is usable immediately.
        const sourceYearRows = await sql<Array<{ id: string }>>`
            SELECT id
            FROM academic_years
            WHERE is_active = true AND id <> ${newYearId}::uuid
            ORDER BY start_date DESC
            LIMIT 1
        `;
        const fallbackRows = sourceYearRows?.length
            ? sourceYearRows
            : await sql<Array<{ id: string }>>`
                SELECT id
                FROM academic_years
                WHERE id <> ${newYearId}::uuid
                ORDER BY start_date DESC
                LIMIT 1
            `;
        const sourceYearId = fallbackRows?.[0]?.id || null;

        if (sourceYearId) {
            const existingCountRows = await sql<Array<{ total: number }>>`
                SELECT COUNT(*)::int AS total
                FROM fee_structures
                WHERE academic_year_id = ${newYearId}::uuid
            `;
            const existingCount = existingCountRows?.[0]?.total || 0;
            if (existingCount === 0) {
                await sql`
                    INSERT INTO fee_structures (
                        academic_year_id,
                        branch_id,
                        class,
                        shift_name,
                        start_time,
                        end_time,
                        num_divisions,
                        term1_fee,
                        term2_fee,
                        book_fee
                    )
                    SELECT
                        ${newYearId}::uuid AS academic_year_id,
                        branch_id,
                        class,
                        shift_name,
                        start_time,
                        end_time,
                        num_divisions,
                        term1_fee,
                        term2_fee,
                        book_fee
                    FROM fee_structures
                    WHERE academic_year_id = ${sourceYearId}::uuid
                    ON CONFLICT (academic_year_id, branch_id, class, shift_name) DO NOTHING
                `;
            }
        }

        revalidatePath('/dashboard/academic-years');
        revalidatePath('/dashboard/classes');
        revalidatePath('/dashboard/fees/structures');
        revalidatePath('/dashboard');
        return { success: true };
    } catch {
        return { error: 'Failed to create Academic Year' };
    }
}

export async function getAcademicYears(): Promise<SerializedAcademicYear[]> {
    await dbConnect();
    const years = await sql<Array<{
        id: string;
        name: string;
        start_date: string;
        end_date: string;
        is_active: boolean;
        is_locked: boolean;
        created_at: string;
        updated_at: string;
    }>>`
        SELECT id, name, start_date, end_date, is_active, is_locked, created_at, updated_at
        FROM academic_years
        ORDER BY start_date DESC
    `;

    return years.map((y) => ({
        _id: y.id,
        name: y.name,
        startDate: dateToISOString(y.start_date),
        endDate: dateToISOString(y.end_date),
        isActive: y.is_active,
        isLocked: y.is_locked,
        createdAt: dateToISOString(y.created_at),
        updatedAt: dateToISOString(y.updated_at),
    }));
}

export async function getAcademicYearsPage({
    search = '',
    page = 0,
    pageSize = 25,
    sortModel,
    filterModel,
}: AcademicYearsPageFilters = {}): Promise<PaginatedResult<SerializedAcademicYear>> {
    await dbConnect();

    const safePage = Number.isFinite(Number(page)) ? Math.max(0, Number(page)) : 0;
    const safePageSize = Number.isFinite(Number(pageSize)) ? Math.min(200, Math.max(5, Number(pageSize))) : 25;
    const offset = safePage * safePageSize;

    const searchWhere = buildLooseSearchWhereSql({
        query: search,
        fields: [
            psql`COALESCE(name,'')`,
            psql`COALESCE(start_date::text,'')`,
            psql`COALESCE(end_date::text,'')`,
            psql`COALESCE(to_char(start_date, 'DD/MM/YYYY'),'')`,
            psql`COALESCE(to_char(end_date, 'DD/MM/YYYY'),'')`,
            psql`(CASE WHEN is_active THEN 'active' ELSE 'inactive' END)`,
            psql`(CASE WHEN is_locked THEN 'locked' ELSE 'unlocked' END)`,
        ],
    });

    const filterWhere = buildFilterWhereSql(filterModel, {
        name: { expr: psql`COALESCE(name,'')` },
        startDate: { expr: psql`start_date::date` },
        endDate: { expr: psql`end_date::date` },
        __status: { expr: psql`(CASE WHEN is_active THEN 'Active' ELSE 'Inactive' END)` },
        isActive: { expr: psql`is_active`, type: 'boolean' },
        isLocked: { expr: psql`is_locked`, type: 'boolean' },
    });

    const sort = normalizeSortModel(sortModel);
    const orderBy = (() => {
        const dir = sort?.direction === 'desc' ? psql`DESC` : psql`ASC`;
        if (sort?.field === 'name') return psql`ORDER BY name ${dir}`;
        if (sort?.field === 'startDate') return psql`ORDER BY start_date ${dir}`;
        if (sort?.field === 'endDate') return psql`ORDER BY end_date ${dir}`;
        if (sort?.field === '__status') return psql`ORDER BY is_active ${dir}, start_date DESC`;
        return psql`ORDER BY start_date DESC`;
    })();

    const countRows = await querySql<Array<{ total: number }>>(psql`
        SELECT COUNT(*)::int AS total
        FROM academic_years
        WHERE 1=1
        ${searchWhere}
          ${filterWhere}
    `);
    const total = countRows?.[0]?.total || 0;

    const years = await querySql<Array<{
        id: string;
        name: string;
        start_date: string;
        end_date: string;
        is_active: boolean;
        is_locked: boolean;
        created_at: string;
        updated_at: string;
    }>>(psql`
        SELECT id, name, start_date, end_date, is_active, is_locked, created_at, updated_at
        FROM academic_years
        WHERE 1=1
        ${searchWhere}
          ${filterWhere}
        ${orderBy}
        LIMIT ${safePageSize}
        OFFSET ${offset}
    `);

    const mapped = years.map((y) => ({
        _id: y.id,
        name: y.name,
        startDate: dateToISOString(y.start_date),
        endDate: dateToISOString(y.end_date),
        isActive: y.is_active,
        isLocked: y.is_locked,
        createdAt: dateToISOString(y.created_at),
        updatedAt: dateToISOString(y.updated_at),
    }));

    return { rows: mapped, total };
}

export async function getAcademicYearById(id: string): Promise<SerializedAcademicYear | null> {
    await dbConnect();
    const rows = await sql<Array<{
        id: string;
        name: string;
        start_date: string;
        end_date: string;
        is_active: boolean;
        is_locked: boolean;
        created_at: string;
        updated_at: string;
    }>>`
        SELECT id, name, start_date, end_date, is_active, is_locked, created_at, updated_at
        FROM academic_years
        WHERE id = ${id}::uuid
        LIMIT 1
    `;
    const y = rows?.[0];
    if (!y) return null;

    return {
        _id: y.id,
        name: y.name,
        startDate: dateToISOString(y.start_date, { dateOnly: true }),
        endDate: dateToISOString(y.end_date, { dateOnly: true }),
        isActive: y.is_active,
        isLocked: y.is_locked,
        createdAt: dateToISOString(y.created_at),
        updatedAt: dateToISOString(y.updated_at),
    };
}

export async function updateAcademicYear(id: string, formData: FormData): Promise<ActionResult> {
    await dbConnect();

    const nameRaw = formData.get('name') as string | null;
    const startDateRaw = formData.get('startDate') as string | null;
    const endDateRaw = formData.get('endDate') as string | null;

    const name = nameRaw ? String(nameRaw).trim() : null;
    const startDateOnly = startDateRaw ? parseDateOnlyInput(startDateRaw) : null;
    const endDateOnly = endDateRaw ? parseDateOnlyInput(endDateRaw) : null;

    if (startDateRaw && !startDateOnly) return { error: 'Invalid Start Date' };
    if (endDateRaw && !endDateOnly) return { error: 'Invalid End Date' };

    try {
        if (startDateOnly || endDateOnly) {
            const currentRows = await sql<Array<{ start_date: string; end_date: string }>>`
                SELECT start_date, end_date
                FROM academic_years
                WHERE id = ${id}::uuid
                LIMIT 1
            `;
            const current = currentRows?.[0];
            if (!current) return { error: 'Academic Year not found' };

            const effectiveStart = startDateOnly || parseDateOnlyInput(current.start_date);
            const effectiveEnd = endDateOnly || parseDateOnlyInput(current.end_date);
            if (effectiveStart && effectiveEnd && effectiveEnd < effectiveStart) {
                return { error: 'End Date must be on or after Start Date' };
            }
        }

        const updated = await sql<Array<{ id: string }>>`
            UPDATE academic_years
            SET
                name = COALESCE(${name || null}, name),
                start_date = COALESCE(${startDateOnly || null}::date, start_date),
                end_date = COALESCE(${endDateOnly || null}::date, end_date),
                updated_at = NOW()
            WHERE id = ${id}::uuid
            RETURNING id
        `;
        if (!updated?.length) {
            return { error: 'Academic Year not found' };
        }
        revalidatePath('/dashboard/academic-years');
        revalidatePath('/dashboard');
        return { success: true };
    } catch (error) {
        const err = error as Error;
        const msg = String((err as any)?.message || 'Failed to update Academic Year');
        if (msg.toLowerCase().includes('unique')) {
            return { error: 'Academic Year with this name already exists' };
        }
        return { error: msg };
    }
}

export async function setActiveYear(id: string): Promise<ActionResult> {
    await dbConnect();

    try {
        await sql.transaction([
            sql`UPDATE academic_years SET is_active = false, updated_at = NOW() WHERE is_active = true`,
            sql`UPDATE academic_years SET is_active = true, updated_at = NOW() WHERE id = ${id}::uuid`,
        ]);

        const exists = await sql<Array<{ id: string }>>`SELECT id FROM academic_years WHERE id = ${id}::uuid LIMIT 1`;
        if (!exists?.length) {
            return { error: 'Academic Year not found' };
        }

        revalidatePath('/dashboard/academic-years');
        revalidatePath('/dashboard');
        revalidatePath('/dashboard/fees');
        revalidatePath('/dashboard/classes');
        revalidatePath('/dashboard/fees/structures');
        revalidatePath('/dashboard/students');
        revalidatePath('/dashboard/enrollment');
        return { success: true };
    } catch (error) {
        const err = error as Error;
        return { error: err.message || 'Failed to set active year' };
    }
}

export async function deleteAcademicYear(id: string): Promise<ActionResult> {
    await dbConnect();

    try {
        const enrollmentCountRows = await sql<Array<{ total: number }>>`
            SELECT COUNT(*)::int AS total FROM student_enrollments WHERE academic_year_id = ${id}::uuid
        `;
        const feeRecordCountRows = await sql<Array<{ total: number }>>`
            SELECT COUNT(*)::int AS total FROM fee_records WHERE academic_year_id = ${id}::uuid
        `;

        const enrollmentCount = enrollmentCountRows?.[0]?.total || 0;
        const feeRecordCount = feeRecordCountRows?.[0]?.total || 0;

        if (enrollmentCount > 0 || feeRecordCount > 0) {
            return {
                error: `Cannot delete: ${enrollmentCount} enrollment(s) and ${feeRecordCount} fee record(s) are linked to this year`
            };
        }

        const deleted = await sql<Array<{ id: string }>>`
            DELETE FROM academic_years WHERE id = ${id}::uuid RETURNING id
        `;
        if (!deleted?.length) {
            return { error: 'Academic Year not found' };
        }

        revalidatePath('/dashboard/academic-years');
        revalidatePath('/dashboard');
        return { success: true };
    } catch (error) {
        const err = error as Error;
        return { error: err.message || 'Failed to delete Academic Year' };
    }
}

export async function lockAcademicYear(id: string, lock: boolean = true): Promise<ActionResult> {
    await dbConnect();

    try {
        const updated = await sql<Array<{ id: string }>>`
            UPDATE academic_years
            SET is_locked = ${lock}, updated_at = NOW()
            WHERE id = ${id}::uuid
            RETURNING id
        `;
        if (!updated?.length) {
            return { error: 'Academic Year not found' };
        }

        revalidatePath('/dashboard/academic-years');
        return { success: true };
    } catch (error) {
        const err = error as Error;
        return { error: err.message || 'Failed to lock Academic Year' };
    }
}

export async function getActiveAcademicYear(): Promise<SerializedAcademicYear | null> {
    await dbConnect();
    const rows = await sql<Array<{
        id: string;
        name: string;
        start_date: string;
        end_date: string;
        is_active: boolean;
        is_locked: boolean;
    }>>`
        SELECT id, name, start_date, end_date, is_active, is_locked
        FROM academic_years
        WHERE is_active = true
        ORDER BY start_date DESC
        LIMIT 1
    `;
    const y = rows?.[0];
    if (!y) return null;

    return {
        _id: y.id,
        name: y.name,
        startDate: dateToISOString(y.start_date),
        endDate: dateToISOString(y.end_date),
        isActive: y.is_active,
        isLocked: y.is_locked,
    };
}
