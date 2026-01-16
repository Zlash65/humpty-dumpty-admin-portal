'use server';

import dbConnect from '@/lib/db';
import { dateToISOString } from '@/lib/serialize';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/sql';
import { psql, querySql } from '@/lib/prismaSql';
import { buildFilterWhereSql, normalizeSortModel } from '@/lib/gridServer';
import { dbShiftFromUi, uiShiftFromDb } from '@/lib/shifts';

// Types for action results
interface ActionResult {
    success?: boolean;
    error?: string;
}

interface IFeeComponents {
    term1: number;
    term2: number;
    bookFee: number;
}

interface SerializedFeeStructure {
    _id: string;
    academicYearId: string;
    branchId: string | null;
    class: string;
    shiftName: string;
    startTime: string;
    endTime: string;
    numDivisions: number;
    components: IFeeComponents;
    createdAt: string | undefined;
    updatedAt: string | undefined;
}

interface PaginatedResult<T> {
    rows: T[];
    total: number;
}

export async function createFeeStructure(formData: FormData): Promise<ActionResult> {
    const academicYearId = formData.get('academicYearId') as string | null;
    const branchId = (formData.get('branchId') as string | null) || undefined;
    const className = formData.get('class') as string | null;
    const shiftName = ((formData.get('shiftName') as string | null) || '').trim();
    const shiftNameDb = dbShiftFromUi(shiftName);
    const startTime = ((formData.get('startTime') as string | null) || '').trim();
    const endTime = ((formData.get('endTime') as string | null) || '').trim();
    const numDivisions = parseInt((formData.get('numDivisions') as string | null) || '1', 10) || 1;
    const term1 = parseFloat((formData.get('term1') as string | null) || '0');
    const term2 = parseFloat((formData.get('term2') as string | null) || '0');
    const bookFee = parseFloat((formData.get('bookFee') as string | null) || '0');

    if (!academicYearId || !className) {
        return { error: 'Academic Year and Class are required' };
    }
    if (!branchId) {
        return { error: 'Branch is required (multi-branch parity with Electron)' };
    }

    try {
        await dbConnect();
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
                book_fee,
                updated_at
            )
            VALUES (
                ${academicYearId}::uuid,
                ${branchId}::uuid,
                ${className},
                ${shiftNameDb},
                ${startTime || ''},
                ${endTime || ''},
                ${numDivisions},
                ${term1},
                ${term2},
                ${bookFee},
                NOW()
            )
            ON CONFLICT (academic_year_id, branch_id, class, shift_name)
            DO UPDATE SET
                start_time = EXCLUDED.start_time,
                end_time = EXCLUDED.end_time,
                num_divisions = EXCLUDED.num_divisions,
                term1_fee = EXCLUDED.term1_fee,
                term2_fee = EXCLUDED.term2_fee,
                book_fee = EXCLUDED.book_fee,
                updated_at = NOW()
        `;

        revalidatePath('/dashboard/fees/structures');
        revalidatePath('/dashboard/classes');
        return { success: true };
    } catch {
        return { error: 'Failed to save Fee Structure' };
    }
}

export async function getFeeStructures(
    academicYearId: string,
    branchId: string | null = null,
    search: string = ''
): Promise<SerializedFeeStructure[]> {
    if (!academicYearId) return [];
    await dbConnect();

    const q = String(search || '').trim() || null;

    let useBranchId: string | null = branchId;
    if (branchId) {
        const countRows = await sql<Array<{ total: number }>>`
            SELECT COUNT(*)::int AS total
            FROM fee_structures
            WHERE academic_year_id = ${academicYearId}::uuid AND branch_id = ${branchId}::uuid
        `;
        const branchCount = countRows?.[0]?.total || 0;
        if (branchCount === 0) {
            // Fallback to legacy/global structures (branch_id is NULL)
            useBranchId = null;
        }
    }

    const rows = await sql<Array<{
        id: string;
        academic_year_id: string;
        branch_id: string | null;
        class: string;
        shift_name: string;
        start_time: string;
        end_time: string;
        num_divisions: number;
        term1_fee: string;
        term2_fee: string;
        book_fee: string;
        created_at: string;
        updated_at: string;
    }>>`
        SELECT
            id,
            academic_year_id,
            branch_id,
            class,
            shift_name,
            start_time,
            end_time,
            num_divisions,
            term1_fee,
            term2_fee,
            book_fee,
            created_at,
            updated_at
        FROM fee_structures
        WHERE academic_year_id = ${academicYearId}::uuid
          AND (${useBranchId}::uuid IS NULL OR branch_id = ${useBranchId}::uuid)
          AND (${useBranchId}::uuid IS NOT NULL OR branch_id IS NULL)
          AND (
              ${q}::text IS NULL OR
              class ILIKE ('%' || ${q} || '%') OR
              (CASE WHEN COALESCE(shift_name,'') = '' THEN 'Morning' ELSE shift_name END) ILIKE ('%' || ${q} || '%')
          )
        ORDER BY class ASC, (CASE WHEN COALESCE(shift_name,'') = '' THEN 'Morning' ELSE shift_name END) ASC
    `;

    return rows.map((s) => ({
        _id: s.id,
        academicYearId: s.academic_year_id,
        branchId: s.branch_id,
        class: s.class || '',
        shiftName: uiShiftFromDb(s.shift_name),
        startTime: s.start_time || '',
        endTime: s.end_time || '',
        numDivisions: Number(s.num_divisions) || 1,
        components: {
            term1: Number(s.term1_fee) || 0,
            term2: Number(s.term2_fee) || 0,
            bookFee: Number(s.book_fee) || 0,
        },
        createdAt: dateToISOString(s.created_at),
        updatedAt: dateToISOString(s.updated_at),
    }));
}

export async function getFeeStructuresPage(
    academicYearId: string,
    branchId: string | null = null,
    search: string = '',
    page: number = 0,
    pageSize: number = 25,
    sortModel?: unknown,
    filterModel?: unknown
): Promise<PaginatedResult<SerializedFeeStructure>> {
    if (!academicYearId) return { rows: [], total: 0 };
    await dbConnect();

    const q = String(search || '').trim() || null;
    const safePage = Number.isFinite(Number(page)) ? Math.max(0, Number(page)) : 0;
    const safePageSize = Number.isFinite(Number(pageSize)) ? Math.min(200, Math.max(5, Number(pageSize))) : 25;
    const offset = safePage * safePageSize;

    let useBranchId: string | null = branchId;
    if (branchId) {
        const countRows = await sql<Array<{ total: number }>>`
            SELECT COUNT(*)::int AS total
            FROM fee_structures
            WHERE academic_year_id = ${academicYearId}::uuid AND branch_id = ${branchId}::uuid
        `;
        const branchCount = countRows?.[0]?.total || 0;
        if (branchCount === 0) {
            useBranchId = null;
        }
    }

    const filterWhere = buildFilterWhereSql(filterModel, {
        class_name: { expr: psql`COALESCE(class,'')` },
        shift_name: { expr: psql`CASE WHEN COALESCE(shift_name,'') = '' THEN 'Morning' ELSE shift_name END` },
        start_time: { expr: psql`COALESCE(start_time,'')` },
        end_time: { expr: psql`COALESCE(end_time,'')` },
        division_count: { expr: psql`num_divisions`, type: 'number' },
        term1_fee: { expr: psql`term1_fee`, type: 'number' },
        term2_fee: { expr: psql`term2_fee`, type: 'number' },
        books_charge: { expr: psql`book_fee`, type: 'number' },
    });

    const sort = normalizeSortModel(sortModel);
    const orderBy = (() => {
        const dir = sort?.direction === 'desc' ? psql`DESC` : psql`ASC`;
        if (sort?.field === 'class_name') return psql`ORDER BY class ${dir}, (CASE WHEN COALESCE(shift_name,'') = '' THEN 'Morning' ELSE shift_name END) ASC`;
        if (sort?.field === 'shift_name') return psql`ORDER BY (CASE WHEN COALESCE(shift_name,'') = '' THEN 'Morning' ELSE shift_name END) ${dir}, class ASC`;
        if (sort?.field === 'start_time') return psql`ORDER BY start_time ${dir} NULLS LAST`;
        if (sort?.field === 'end_time') return psql`ORDER BY end_time ${dir} NULLS LAST`;
        if (sort?.field === 'division_count') return psql`ORDER BY num_divisions ${dir}`;
        if (sort?.field === 'term1_fee') return psql`ORDER BY term1_fee ${dir}`;
        if (sort?.field === 'term2_fee') return psql`ORDER BY term2_fee ${dir}`;
        if (sort?.field === 'books_charge') return psql`ORDER BY book_fee ${dir}`;
        return psql`ORDER BY class ASC, (CASE WHEN COALESCE(shift_name,'') = '' THEN 'Morning' ELSE shift_name END) ASC`;
    })();

    const countRows = await querySql<Array<{ total: number }>>(psql`
        SELECT COUNT(*)::int AS total
        FROM fee_structures
        WHERE academic_year_id = ${academicYearId}::uuid
          AND (${useBranchId}::uuid IS NULL OR branch_id = ${useBranchId}::uuid)
          AND (${useBranchId}::uuid IS NOT NULL OR branch_id IS NULL)
          AND (
              ${q}::text IS NULL OR
              class ILIKE ('%' || ${q} || '%') OR
              (CASE WHEN COALESCE(shift_name,'') = '' THEN 'Morning' ELSE shift_name END) ILIKE ('%' || ${q} || '%')
          )
          ${filterWhere}
    `);
    const total = countRows?.[0]?.total || 0;

    const rows = await querySql<Array<{
        id: string;
        academic_year_id: string;
        branch_id: string | null;
        class: string;
        shift_name: string;
        start_time: string;
        end_time: string;
        num_divisions: number;
        term1_fee: string;
        term2_fee: string;
        book_fee: string;
        created_at: string;
        updated_at: string;
    }>>(psql`
        SELECT
            id,
            academic_year_id,
            branch_id,
            class,
            shift_name,
            start_time,
            end_time,
            num_divisions,
            term1_fee,
            term2_fee,
            book_fee,
            created_at,
            updated_at
        FROM fee_structures
        WHERE academic_year_id = ${academicYearId}::uuid
          AND (${useBranchId}::uuid IS NULL OR branch_id = ${useBranchId}::uuid)
          AND (${useBranchId}::uuid IS NOT NULL OR branch_id IS NULL)
          AND (
              ${q}::text IS NULL OR
              class ILIKE ('%' || ${q} || '%') OR
              (CASE WHEN COALESCE(shift_name,'') = '' THEN 'Morning' ELSE shift_name END) ILIKE ('%' || ${q} || '%')
          )
          ${filterWhere}
        ${orderBy}
        LIMIT ${safePageSize}
        OFFSET ${offset}
    `);

    const mapped = rows.map((s) => ({
        _id: s.id,
        academicYearId: s.academic_year_id,
        branchId: s.branch_id,
        class: s.class || '',
        shiftName: uiShiftFromDb(s.shift_name),
        startTime: s.start_time || '',
        endTime: s.end_time || '',
        numDivisions: Number(s.num_divisions) || 1,
        components: {
            term1: Number(s.term1_fee) || 0,
            term2: Number(s.term2_fee) || 0,
            bookFee: Number(s.book_fee) || 0,
        },
        createdAt: dateToISOString(s.created_at),
        updatedAt: dateToISOString(s.updated_at),
    }));

    return { rows: mapped, total };
}

export async function updateFeeStructure(id: string, formData: FormData): Promise<ActionResult> {
    if (!id) return { error: 'Class entry is required' };

    const academicYearId = formData.get('academicYearId') as string | null;
    const branchId = (formData.get('branchId') as string | null) || undefined;
    const className = formData.get('class') as string | null;
    const shiftName = ((formData.get('shiftName') as string | null) || '').trim();
    const shiftNameDb = dbShiftFromUi(shiftName);
    const startTime = ((formData.get('startTime') as string | null) || '').trim();
    const endTime = ((formData.get('endTime') as string | null) || '').trim();
    const numDivisions = parseInt((formData.get('numDivisions') as string | null) || '1', 10) || 1;
    const term1 = parseFloat((formData.get('term1') as string | null) || '0');
    const term2 = parseFloat((formData.get('term2') as string | null) || '0');
    const bookFee = parseFloat((formData.get('bookFee') as string | null) || '0');

    if (!academicYearId || !className) return { error: 'Academic Year and Class are required' };
    if (!branchId) return { error: 'Branch is required (multi-branch parity with Electron)' };

    await dbConnect();
    const updated = await sql<Array<{ id: string }>>`
        UPDATE fee_structures
        SET
            academic_year_id = ${academicYearId}::uuid,
            branch_id = ${branchId}::uuid,
            class = ${className},
            shift_name = ${shiftNameDb},
            start_time = ${startTime || ''},
            end_time = ${endTime || ''},
            num_divisions = ${numDivisions},
            term1_fee = ${term1},
            term2_fee = ${term2},
            book_fee = ${bookFee},
            updated_at = NOW()
        WHERE id = ${id}::uuid
        RETURNING id
    `;
    if (!updated?.length) return { error: 'Class entry not found' };

    revalidatePath('/dashboard/classes');
    revalidatePath('/dashboard/fees/structures');
    return { success: true };
}

export async function deleteFeeStructure(id: string): Promise<ActionResult> {
    if (!id) return { error: 'Class entry is required' };
    await dbConnect();

    const res = await sql<Array<{ id: string }>>`
        DELETE FROM fee_structures WHERE id = ${id}::uuid RETURNING id
    `;
    if (!res?.length) return { error: 'Class entry not found' };
    revalidatePath('/dashboard/classes');
    revalidatePath('/dashboard/fees/structures');
    return { success: true };
}
