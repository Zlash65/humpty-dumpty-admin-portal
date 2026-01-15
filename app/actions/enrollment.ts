'use server';

import dbConnect from '@/lib/db';
import { dateToISOString } from '@/lib/serialize';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/sql';
import { psql, querySql } from '@/lib/prismaSql';
import { buildFilterWhereSql, normalizeSortModel } from '@/lib/gridServer';

// Types for action results
interface ActionResult {
    success?: boolean;
    error?: string;
}

interface FeeAmounts {
    term1: number;
    term2: number;
    bookFee: number;
}

type FeeHeadKey = 'term1' | 'term2' | 'bookFee';

interface SerializedEnrollment {
    _id: string;
    academicYearId: string;
    studentId: {
        _id: string;
        firstName?: string;
        lastName?: string;
        admissionNumber?: string;
    };
    class?: string;
    section?: string;
    rollNumber?: string;
    shiftName?: string;
    status?: string;
    joinDate: string | undefined;
}

interface EnrollmentPageFilters {
    academicYearId?: string;
    branchId?: string | null;
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

function applyScholarshipToFeeAmounts({ term1 = 0, term2 = 0, bookFee = 0 }: Partial<FeeAmounts>, scholarshipRaw: number | string | null | undefined): FeeAmounts {
    let scholarship = Number(scholarshipRaw) || 0;
    if (scholarship <= 0) return { term1, term2, bookFee };

    const out: FeeAmounts = { term1: Number(term1) || 0, term2: Number(term2) || 0, bookFee: Number(bookFee) || 0 };
    const keys: FeeHeadKey[] = ['term1', 'term2', 'bookFee'];
    for (const key of keys) {
        if (scholarship <= 0) break;
        const take = Math.min(out[key], scholarship);
        out[key] = Math.max(0, out[key] - take);
        scholarship -= take;
    }
    return out;
}

export async function enrollStudent(formData: FormData): Promise<ActionResult> {
    const studentId = formData.get('studentId') as string | null;
    const academicYearId = formData.get('academicYearId') as string | null;
    const className = formData.get('class') as string | null;
    const section = formData.get('section') as string | null;
    const rollNumber = formData.get('rollNumber') as string | null;

    if (!studentId || !academicYearId || !className || !section) {
        return { error: 'All fields are required' };
    }

    try {
        await dbConnect();

        const yearRows = await sql<Array<{ id: string }>>`
            SELECT id FROM academic_years WHERE id = ${academicYearId}::uuid LIMIT 1
        `;
        if (!yearRows?.length) return { error: 'Invalid Academic Year' };

        const studentRows = await sql<Array<{ branch_id: string | null; fee_scholarship: string }>>`
            SELECT branch_id, fee_scholarship
            FROM students
            WHERE id = ${studentId}::uuid
            LIMIT 1
        `;
        const student = studentRows?.[0] || null;
        const branchId = student?.branch_id || null;
        const feeScholarship = Number(student?.fee_scholarship) || 0;

        const existing = await sql<Array<{ id: string }>>`
            SELECT id FROM student_enrollments
            WHERE academic_year_id = ${academicYearId}::uuid AND student_id = ${studentId}::uuid
            LIMIT 1
        `;
        if (existing?.length) {
            return { error: 'Student is already enrolled in this Academic Year' };
        }

        // Fetch Fee Structure for this Class/Year (prefer branch-scoped; prefer default shift)
        const preferredShift = '';
        let feeStructureRows: Array<{
            shift_name: string;
            term1_fee: string;
            term2_fee: string;
            book_fee: string;
        }> = [];

        if (branchId) {
            feeStructureRows = await sql`
                SELECT shift_name, term1_fee, term2_fee, book_fee
                FROM fee_structures
                WHERE academic_year_id = ${academicYearId}::uuid
                  AND branch_id = ${branchId}::uuid
                  AND class = ${className}
                  AND shift_name = ${preferredShift}
                LIMIT 1
            `;
            if (!feeStructureRows?.length) {
                feeStructureRows = await sql`
                    SELECT shift_name, term1_fee, term2_fee, book_fee
                    FROM fee_structures
                    WHERE academic_year_id = ${academicYearId}::uuid
                      AND branch_id = ${branchId}::uuid
                      AND class = ${className}
                    ORDER BY shift_name ASC
                    LIMIT 1
                `;
            }
        }
        if (!feeStructureRows?.length) {
            feeStructureRows = await sql`
                SELECT shift_name, term1_fee, term2_fee, book_fee
                FROM fee_structures
                WHERE academic_year_id = ${academicYearId}::uuid
                  AND branch_id IS NULL
                  AND class = ${className}
                  AND shift_name = ${preferredShift}
                LIMIT 1
            `;
            if (!feeStructureRows?.length) {
                feeStructureRows = await sql`
                    SELECT shift_name, term1_fee, term2_fee, book_fee
                    FROM fee_structures
                    WHERE academic_year_id = ${academicYearId}::uuid
                      AND branch_id IS NULL
                      AND class = ${className}
                    ORDER BY shift_name ASC
                    LIMIT 1
                `;
            }
        }

        const fs = feeStructureRows?.[0] || null;
        const shiftName = fs?.shift_name || '';

        const enrollmentRows = await sql<Array<{ id: string }>>`
            INSERT INTO student_enrollments (
                academic_year_id,
                student_id,
                class,
                section,
                roll_number,
                shift_name,
                status,
                join_date,
                updated_at
            )
            VALUES (
                ${academicYearId}::uuid,
                ${studentId}::uuid,
                ${className},
                ${section},
                ${rollNumber || null},
                ${shiftName},
                'Active',
                CURRENT_DATE,
                NOW()
            )
            RETURNING id
        `;
        const enrollmentId = enrollmentRows?.[0]?.id;
        if (!enrollmentId) return { error: 'Failed to enroll student' };

        const adjusted = applyScholarshipToFeeAmounts(
            { term1: Number(fs?.term1_fee) || 0, term2: Number(fs?.term2_fee) || 0, bookFee: Number(fs?.book_fee) || 0 },
            feeScholarship
        );

        const term1Status = adjusted.term1 <= 0 ? 'Paid' : 'Pending';
        const term2Status = adjusted.term2 <= 0 ? 'Paid' : 'Pending';
        const bookStatus = adjusted.bookFee <= 0 ? 'Paid' : 'Pending';

        await sql`
            INSERT INTO fee_records (
                academic_year_id,
                student_id,
                enrollment_id,
                branch_id,
                term1_amount,
                term1_paid,
                term1_status,
                term2_amount,
                term2_paid,
                term2_status,
                book_fee_amount,
                book_fee_paid,
                book_fee_status,
                months_paid,
                updated_at
            )
            VALUES (
                ${academicYearId}::uuid,
                ${studentId}::uuid,
                ${enrollmentId}::uuid,
                ${branchId}::uuid,
                ${adjusted.term1},
                0,
                ${term1Status},
                ${adjusted.term2},
                0,
                ${term2Status},
                ${adjusted.bookFee},
                0,
                ${bookStatus},
                '{}'::jsonb,
                NOW()
            )
            ON CONFLICT (academic_year_id, student_id)
            DO UPDATE SET
                enrollment_id = EXCLUDED.enrollment_id,
                branch_id = EXCLUDED.branch_id,
                term1_amount = EXCLUDED.term1_amount,
                term1_status = EXCLUDED.term1_status,
                term2_amount = EXCLUDED.term2_amount,
                term2_status = EXCLUDED.term2_status,
                book_fee_amount = EXCLUDED.book_fee_amount,
                book_fee_status = EXCLUDED.book_fee_status,
                updated_at = NOW()
        `;

        revalidatePath('/dashboard/enrollment');
        revalidatePath('/dashboard/fees');
        revalidatePath('/dashboard/students');
        return { success: true };
    } catch {
        return { error: 'Failed to enroll student' };
    }
}

export async function getEnrollments(academicYearId: string, branchId: string | null = null): Promise<SerializedEnrollment[]> {
    if (!academicYearId) return [];

    await dbConnect();
    const rows = await sql<Array<{
        id: string;
        academic_year_id: string;
        class: string;
        section: string;
        roll_number: string | null;
        shift_name: string;
        status: string;
        join_date: string;
        student_id: string;
        first_name: string;
        last_name: string;
        admission_number: string;
    }>>`
        SELECT
            e.id,
            e.academic_year_id,
            e.class,
            e.section,
            e.roll_number,
            e.shift_name,
            e.status,
            e.join_date,
            s.id AS student_id,
            s.first_name,
            s.last_name,
            s.admission_number
        FROM student_enrollments e
        JOIN students s ON s.id = e.student_id
        WHERE e.academic_year_id = ${academicYearId}::uuid
          AND (${branchId}::uuid IS NULL OR s.branch_id = ${branchId}::uuid)
        ORDER BY e.class ASC, e.section ASC, e.roll_number ASC NULLS LAST
    `;

    return rows.map((e) => ({
        _id: e.id,
        academicYearId: e.academic_year_id,
        studentId: {
            _id: e.student_id,
            firstName: e.first_name,
            lastName: e.last_name,
            admissionNumber: e.admission_number,
        },
        class: e.class,
        section: e.section,
        rollNumber: e.roll_number || undefined,
        shiftName: e.shift_name,
        status: e.status,
        joinDate: dateToISOString(e.join_date),
    }));
}

export async function getEnrollmentsPage({
    academicYearId,
    branchId = null,
    search = '',
    page = 0,
    pageSize = 25,
    sortModel,
    filterModel,
}: EnrollmentPageFilters = {}): Promise<PaginatedResult<SerializedEnrollment>> {
    if (!academicYearId) return { rows: [], total: 0 };
    await dbConnect();

    const q = String(search || '').trim() || null;
    const safePage = Number.isFinite(Number(page)) ? Math.max(0, Number(page)) : 0;
    const safePageSize = Number.isFinite(Number(pageSize)) ? Math.min(200, Math.max(5, Number(pageSize))) : 25;
    const offset = safePage * safePageSize;

    const filterWhere = buildFilterWhereSql(filterModel, {
        class: { expr: psql`COALESCE(e.class,'')` },
        section: { expr: psql`COALESCE(e.section,'')` },
        rollNumber: { expr: psql`COALESCE(e.roll_number,'')` },
        admissionNumber: { expr: psql`COALESCE(s.admission_number,'')` },
        name: { expr: psql`(s.first_name || ' ' || s.last_name)` },
        status: { expr: psql`COALESCE(e.status,'')` },
        shiftName: { expr: psql`COALESCE(e.shift_name,'')` },
        joinDate: { expr: psql`COALESCE(e.join_date::text,'')` },
    });

    const sort = normalizeSortModel(sortModel);
    const orderBy = (() => {
        const dir = sort?.direction === 'desc' ? psql`DESC` : psql`ASC`;
        if (sort?.field === 'class') return psql`ORDER BY e.class ${dir}, e.section ASC, e.roll_number ASC NULLS LAST`;
        if (sort?.field === 'section') return psql`ORDER BY e.section ${dir}, e.class ASC, e.roll_number ASC NULLS LAST`;
        if (sort?.field === 'rollNumber') return psql`ORDER BY e.roll_number ${dir} NULLS LAST`;
        if (sort?.field === 'admissionNumber') return psql`ORDER BY s.admission_number ${dir} NULLS LAST`;
        if (sort?.field === 'name') return psql`ORDER BY (s.first_name || ' ' || s.last_name) ${dir}`;
        if (sort?.field === 'status') return psql`ORDER BY e.status ${dir}`;
        if (sort?.field === 'joinDate') return psql`ORDER BY e.join_date ${dir} NULLS LAST`;
        return psql`ORDER BY e.class ASC, e.section ASC, e.roll_number ASC NULLS LAST`;
    })();

    const countRows = await querySql<Array<{ total: number }>>(psql`
        SELECT COUNT(*)::int AS total
        FROM student_enrollments e
        JOIN students s ON s.id = e.student_id
        WHERE e.academic_year_id = ${academicYearId}::uuid
          AND (${branchId}::uuid IS NULL OR s.branch_id = ${branchId}::uuid)
          AND (
              ${q}::text IS NULL OR
              (s.first_name || ' ' || s.last_name) ILIKE ('%' || ${q} || '%') OR
              COALESCE(s.admission_number,'') ILIKE ('%' || ${q} || '%') OR
              COALESCE(e.roll_number,'') ILIKE ('%' || ${q} || '%') OR
              e.class ILIKE ('%' || ${q} || '%') OR
              e.section ILIKE ('%' || ${q} || '%') OR
              e.shift_name ILIKE ('%' || ${q} || '%')
          )
          ${filterWhere}
    `);
    const total = countRows?.[0]?.total || 0;

    const rows = await querySql<Array<{
        id: string;
        academic_year_id: string;
        class: string;
        section: string;
        roll_number: string | null;
        shift_name: string;
        status: string;
        join_date: string;
        student_id: string;
        first_name: string;
        last_name: string;
        admission_number: string;
    }>>(psql`
        SELECT
            e.id,
            e.academic_year_id,
            e.class,
            e.section,
            e.roll_number,
            e.shift_name,
            e.status,
            e.join_date,
            s.id AS student_id,
            s.first_name,
            s.last_name,
            s.admission_number
        FROM student_enrollments e
        JOIN students s ON s.id = e.student_id
        WHERE e.academic_year_id = ${academicYearId}::uuid
          AND (${branchId}::uuid IS NULL OR s.branch_id = ${branchId}::uuid)
          AND (
              ${q}::text IS NULL OR
              (s.first_name || ' ' || s.last_name) ILIKE ('%' || ${q} || '%') OR
              COALESCE(s.admission_number,'') ILIKE ('%' || ${q} || '%') OR
              COALESCE(e.roll_number,'') ILIKE ('%' || ${q} || '%') OR
              e.class ILIKE ('%' || ${q} || '%') OR
              e.section ILIKE ('%' || ${q} || '%') OR
              e.shift_name ILIKE ('%' || ${q} || '%')
          )
          ${filterWhere}
        ${orderBy}
        LIMIT ${safePageSize}
        OFFSET ${offset}
    `);

    const mapped = rows.map((e) => ({
        _id: e.id,
        academicYearId: e.academic_year_id,
        studentId: {
            _id: e.student_id,
            firstName: e.first_name,
            lastName: e.last_name,
            admissionNumber: e.admission_number,
        },
        class: e.class,
        section: e.section,
        rollNumber: e.roll_number || undefined,
        shiftName: e.shift_name,
        status: e.status,
        joinDate: dateToISOString(e.join_date),
    }));

    return { rows: mapped, total };
}
