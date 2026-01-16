'use server';

import dbConnect from '@/lib/db';
import { dateToISOString } from '@/lib/serialize';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/sql';
import { psql, querySql } from '@/lib/prismaSql';
import { buildFilterWhereSql, normalizeSortModel } from '@/lib/gridServer';
import { divisionsFromCount } from '@/lib/divisions';
import { logAudit } from '@/lib/audit';
import { getCurrentUsername } from '@/lib/currentUser';
import { uiShiftFromDb } from '@/lib/shifts';

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
    division?: string;
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
    const feeStructureId = formData.get('feeStructureId') as string | null;
    const divisionRaw = formData.get('division') as string | null;
    const rollNumber = formData.get('rollNumber') as string | null;

    if (!studentId || !academicYearId || !feeStructureId || !divisionRaw) {
        return { error: 'All fields are required' };
    }

    try {
        await dbConnect();

        const yearRows = await sql<Array<{ id: string }>>`
            SELECT id FROM academic_years WHERE id = ${academicYearId}::uuid LIMIT 1
        `;
        if (!yearRows?.length) return { error: 'Invalid Academic Year' };

        const studentRows = await sql<Array<{ branch_id: string | null; fee_scholarship: string; first_name: string; last_name: string; admission_number: string | null }>>`
            SELECT branch_id, fee_scholarship, first_name, last_name, admission_number
            FROM students
            WHERE id = ${studentId}::uuid
            LIMIT 1
        `;
        const student = studentRows?.[0] || null;
        const branchId = student?.branch_id || null;
        const feeScholarship = Number(student?.fee_scholarship) || 0;
        const studentName = `${student?.first_name || ''} ${student?.last_name || ''}`.trim() || 'Student';
        const studentAdmission = student?.admission_number ? ` (${student.admission_number})` : '';

        const existing = await sql<Array<{ id: string }>>`
            SELECT id FROM student_enrollments
            WHERE academic_year_id = ${academicYearId}::uuid AND student_id = ${studentId}::uuid
            LIMIT 1
        `;
        if (existing?.length) {
            return { error: 'Student is already enrolled in this Academic Year' };
        }

        const feeStructureRows = await sql<Array<{
            class: string;
            shift_name: string;
            num_divisions: number;
            term1_fee: string;
            term2_fee: string;
            book_fee: string;
            branch_id: string | null;
        }>>`
            SELECT class, shift_name, num_divisions, term1_fee, term2_fee, book_fee, branch_id
            FROM fee_structures
            WHERE id = ${feeStructureId}::uuid
              AND academic_year_id = ${academicYearId}::uuid
            LIMIT 1
        `;

        const fs = feeStructureRows?.[0] || null;
        if (!fs?.class) return { error: 'Invalid Class selection' };

        if (fs.branch_id && branchId && String(fs.branch_id) !== String(branchId)) {
            return { error: 'Selected Class does not belong to this student branch' };
        }
        if (fs.branch_id && !branchId) {
            return { error: 'Selected Class requires a student branch but student has none' };
        }

        const className = fs.class;
        const shiftName = fs.shift_name || '';

        const division = String(divisionRaw || '').trim().toUpperCase();
        const allowed = new Set(divisionsFromCount(fs.num_divisions || 1).map((d) => String(d).toUpperCase()));
        if (!division || !allowed.has(division)) {
            return { error: `Invalid Division. Allowed: ${Array.from(allowed).join(', ')}` };
        }

        const enrollmentRows = await sql<Array<{ id: string }>>`
            INSERT INTO student_enrollments (
                academic_year_id,
                student_id,
                class,
                division,
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
                ${division},
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
        await logAudit({
            action: 'create',
            entity: 'enrollment',
            entityId: enrollmentId,
            entityName: `${studentName}${studentAdmission}`.trim(),
            changes: {
                studentId,
                academicYearId,
                class: className,
                division,
                shiftName,
                rollNumber: rollNumber || null,
            },
            performedBy: await getCurrentUsername(),
        });
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
        division: string;
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
            e.division,
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
        ORDER BY e.class ASC, e.division ASC, e.roll_number ASC NULLS LAST
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
        division: e.division,
        rollNumber: e.roll_number || undefined,
        shiftName: uiShiftFromDb(e.shift_name),
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
        division: { expr: psql`COALESCE(e.division,'')` },
        rollNumber: { expr: psql`COALESCE(e.roll_number,'')` },
        admissionNumber: { expr: psql`COALESCE(s.admission_number,'')` },
        name: { expr: psql`(s.first_name || ' ' || s.last_name)` },
        status: { expr: psql`COALESCE(e.status,'')` },
        shiftName: { expr: psql`CASE WHEN COALESCE(e.shift_name,'') = '' THEN 'Morning' ELSE e.shift_name END` },
        joinDate: { expr: psql`COALESCE(e.join_date::text,'')` },
    });

    const sort = normalizeSortModel(sortModel);
    const orderBy = (() => {
        const dir = sort?.direction === 'desc' ? psql`DESC` : psql`ASC`;
        if (sort?.field === 'class') return psql`ORDER BY e.class ${dir}, e.division ASC, e.roll_number ASC NULLS LAST`;
        if (sort?.field === 'division') return psql`ORDER BY e.division ${dir}, e.class ASC, e.roll_number ASC NULLS LAST`;
        if (sort?.field === 'rollNumber') return psql`ORDER BY e.roll_number ${dir} NULLS LAST`;
        if (sort?.field === 'admissionNumber') return psql`ORDER BY s.admission_number ${dir} NULLS LAST`;
        if (sort?.field === 'name') return psql`ORDER BY (s.first_name || ' ' || s.last_name) ${dir}`;
        if (sort?.field === 'status') return psql`ORDER BY e.status ${dir}`;
        if (sort?.field === 'joinDate') return psql`ORDER BY e.join_date ${dir} NULLS LAST`;
        return psql`ORDER BY e.class ASC, e.division ASC, e.roll_number ASC NULLS LAST`;
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
              e.division ILIKE ('%' || ${q} || '%') OR
              (CASE WHEN COALESCE(e.shift_name,'') = '' THEN 'Morning' ELSE e.shift_name END) ILIKE ('%' || ${q} || '%')
          )
          ${filterWhere}
    `);
    const total = countRows?.[0]?.total || 0;

    const rows = await querySql<Array<{
        id: string;
        academic_year_id: string;
        class: string;
        division: string;
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
            e.division,
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
              e.division ILIKE ('%' || ${q} || '%') OR
              (CASE WHEN COALESCE(e.shift_name,'') = '' THEN 'Morning' ELSE e.shift_name END) ILIKE ('%' || ${q} || '%')
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
        division: e.division,
        rollNumber: e.roll_number || undefined,
        shiftName: uiShiftFromDb(e.shift_name),
        status: e.status,
        joinDate: dateToISOString(e.join_date),
    }));

    return { rows: mapped, total };
}

export async function updateEnrollment(
    enrollmentId: string,
    data: { feeStructureId?: string; division?: string; rollNumber?: string }
): Promise<ActionResult> {
    if (!enrollmentId) {
        return { error: 'Enrollment ID is required' };
    }

    const feeStructureId = String(data.feeStructureId || '').trim();
    const division = String(data.division || '').trim().toUpperCase();
    const rollNumberRaw = typeof data.rollNumber === 'string' ? data.rollNumber : '';
    const nextRollNumber = rollNumberRaw.trim() ? rollNumberRaw.trim() : null;

    if (!feeStructureId) {
        return { error: 'Class is required' };
    }
    if (!division) {
        return { error: 'Division is required' };
    }

    try {
        await dbConnect();

        const existingRows = await sql<Array<{
            id: string;
            student_id: string;
            academic_year_id: string;
            class: string;
            division: string;
            roll_number: string | null;
            shift_name: string;
            branch_id: string | null;
            fee_scholarship: string;
            first_name: string;
            last_name: string;
            admission_number: string | null;
        }>>`
            SELECT
                e.id,
                e.student_id,
                e.academic_year_id,
                e.class,
                e.division,
                e.roll_number,
                e.shift_name,
                s.branch_id,
                s.fee_scholarship,
                s.first_name,
                s.last_name,
                s.admission_number
            FROM student_enrollments e
            JOIN students s ON s.id = e.student_id
            WHERE e.id = ${enrollmentId}::uuid
            LIMIT 1
        `;
        const existing = existingRows?.[0] || null;
        if (!existing?.id) {
            return { error: 'Enrollment not found' };
        }

        const feeStructureRows = await sql<Array<{
            class: string;
            shift_name: string;
            num_divisions: number;
            term1_fee: string;
            term2_fee: string;
            book_fee: string;
            branch_id: string | null;
        }>>`
            SELECT class, shift_name, num_divisions, term1_fee, term2_fee, book_fee, branch_id
            FROM fee_structures
            WHERE id = ${feeStructureId}::uuid
              AND academic_year_id = ${existing.academic_year_id}::uuid
            LIMIT 1
        `;
        const fs = feeStructureRows?.[0] || null;
        if (!fs?.class) return { error: 'Invalid Class selection' };

        const studentBranchId = existing.branch_id || null;
        if (fs.branch_id && studentBranchId && String(fs.branch_id) !== String(studentBranchId)) {
            return { error: 'Selected Class does not belong to this student branch' };
        }
        if (fs.branch_id && !studentBranchId) {
            return { error: 'Selected Class requires a student branch but student has none' };
        }

        const allowedDivisions = divisionsFromCount(fs.num_divisions || 1).map((d) => String(d).toUpperCase());
        if (!allowedDivisions.includes(division)) {
            return { error: `Invalid Division. Allowed: ${allowedDivisions.join(', ')}` };
        }

        const nextClassName = fs.class;
        const nextShiftNameDb = fs.shift_name || '';

        await sql`
            UPDATE student_enrollments
            SET
                class = ${nextClassName},
                division = ${division},
                roll_number = ${nextRollNumber},
                shift_name = ${nextShiftNameDb},
                updated_at = NOW()
            WHERE id = ${enrollmentId}::uuid
        `;

        // Ensure fee record amounts align with the updated class/shift.
        const scholarship = Number(existing.fee_scholarship) || 0;
        const adjusted = applyScholarshipToFeeAmounts(
            { term1: Number(fs.term1_fee) || 0, term2: Number(fs.term2_fee) || 0, bookFee: Number(fs.book_fee) || 0 },
            scholarship
        );

        const feeRecordRows = await sql<Array<{
            id: string;
            term1_paid: string;
            term2_paid: string;
            book_fee_paid: string;
        }>>`
            SELECT id, term1_paid, term2_paid, book_fee_paid
            FROM fee_records
            WHERE academic_year_id = ${existing.academic_year_id}::uuid
              AND student_id = ${existing.student_id}::uuid
            LIMIT 1
        `;
        const fr = feeRecordRows?.[0] || null;
        const term1Paid = Number(fr?.term1_paid) || 0;
        const term2Paid = Number(fr?.term2_paid) || 0;
        const bookPaid = Number(fr?.book_fee_paid) || 0;

        const term1Status = adjusted.term1 <= 0 ? 'Paid' : term1Paid >= adjusted.term1 ? 'Paid' : term1Paid > 0 ? 'Partial' : 'Pending';
        const term2Status = adjusted.term2 <= 0 ? 'Paid' : term2Paid >= adjusted.term2 ? 'Paid' : term2Paid > 0 ? 'Partial' : 'Pending';
        const bookStatus = adjusted.bookFee <= 0 ? 'Paid' : bookPaid >= adjusted.bookFee ? 'Paid' : bookPaid > 0 ? 'Partial' : 'Pending';

        if (fr?.id) {
            await sql`
                UPDATE fee_records
                SET
                    enrollment_id = ${enrollmentId}::uuid,
                    branch_id = ${studentBranchId}::uuid,
                    term1_amount = ${adjusted.term1},
                    term1_status = ${term1Status},
                    term2_amount = ${adjusted.term2},
                    term2_status = ${term2Status},
                    book_fee_amount = ${adjusted.bookFee},
                    book_fee_status = ${bookStatus},
                    updated_at = NOW()
                WHERE id = ${fr.id}::uuid
            `;
        } else {
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
                    ${existing.academic_year_id}::uuid,
                    ${existing.student_id}::uuid,
                    ${enrollmentId}::uuid,
                    ${studentBranchId}::uuid,
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
        }

        const studentName = `${existing.first_name || ''} ${existing.last_name || ''}`.trim() || 'Student';
        const studentAdmission = existing.admission_number ? ` (${existing.admission_number})` : '';
        await logAudit({
            action: 'update',
            entity: 'enrollment',
            entityId: enrollmentId,
            entityName: `${studentName}${studentAdmission}`.trim(),
            changes: {
                class: { old: existing.class, new: nextClassName },
                division: { old: existing.division, new: division },
                rollNumber: { old: existing.roll_number, new: nextRollNumber },
                shiftName: { old: uiShiftFromDb(existing.shift_name), new: uiShiftFromDb(nextShiftNameDb) },
            },
            performedBy: await getCurrentUsername(),
        });

        revalidatePath('/dashboard/enrollment');
        revalidatePath('/dashboard/fees');
        revalidatePath('/dashboard/students');
        return { success: true };
    } catch {
        return { error: 'Failed to update enrollment' };
    }
}

export async function deleteEnrollment(enrollmentId: string): Promise<ActionResult> {
    if (!enrollmentId) {
        return { error: 'Enrollment ID is required' };
    }

    try {
        await dbConnect();

        const existingRows = await sql<Array<{
            id: string;
            student_id: string;
            academic_year_id: string;
            class: string;
            division: string;
            roll_number: string | null;
            shift_name: string;
            first_name: string;
            last_name: string;
            admission_number: string | null;
        }>>`
            SELECT
                e.id,
                e.student_id,
                e.academic_year_id,
                e.class,
                e.division,
                e.roll_number,
                e.shift_name,
                s.first_name,
                s.last_name,
                s.admission_number
            FROM student_enrollments e
            JOIN students s ON s.id = e.student_id
            WHERE e.id = ${enrollmentId}::uuid
            LIMIT 1
        `;
        const enrollment = existingRows?.[0] || null;
        if (!enrollment?.id) {
            return { error: 'Enrollment not found' };
        }

        const feeRecordRows = await sql<Array<{ id: string }>>`
            SELECT id
            FROM fee_records
            WHERE enrollment_id = ${enrollmentId}::uuid
            LIMIT 1
        `;
        const feeRecordId = feeRecordRows?.[0]?.id || null;
        if (feeRecordId) {
            const txCountRows = await sql<Array<{ total: number }>>`
                SELECT COUNT(*)::int AS total
                FROM fee_transactions
                WHERE fee_record_id = ${feeRecordId}::uuid
            `;
            const txCount = txCountRows?.[0]?.total || 0;
            if (txCount > 0) {
                return { error: 'Cannot delete enrollment with existing fee payments. Delete the payments first.' };
            }
        }

        // Delete associated fee record first (if any)
        await sql`
            DELETE FROM fee_records
            WHERE enrollment_id = ${enrollmentId}::uuid
        `;

        // Delete the enrollment
        await sql`
            DELETE FROM student_enrollments WHERE id = ${enrollmentId}::uuid
        `;

        const studentName = `${enrollment.first_name || ''} ${enrollment.last_name || ''}`.trim() || 'Student';
        const studentAdmission = enrollment.admission_number ? ` (${enrollment.admission_number})` : '';
        await logAudit({
            action: 'delete',
            entity: 'enrollment',
            entityId: enrollmentId,
            entityName: `${studentName}${studentAdmission}`.trim(),
            changes: {
                class: { old: enrollment.class, new: null },
                division: { old: enrollment.division, new: null },
                rollNumber: { old: enrollment.roll_number, new: null },
                shiftName: { old: uiShiftFromDb(enrollment.shift_name), new: null },
            },
            performedBy: await getCurrentUsername(),
        });

        revalidatePath('/dashboard/enrollment');
        revalidatePath('/dashboard/fees');
        revalidatePath('/dashboard/students');
        return { success: true };
    } catch {
        return { error: 'Failed to delete enrollment' };
    }
}
