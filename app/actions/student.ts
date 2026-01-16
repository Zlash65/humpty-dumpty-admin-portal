'use server';

import dbConnect from '@/lib/db';
import { dateToISOString } from '@/lib/serialize';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { getCurrentUsername } from '@/lib/currentUser';
import { sql } from '@/lib/sql';
import { psql, querySql } from '@/lib/prismaSql';
import { buildFilterWhereSql, normalizeSortModel } from '@/lib/gridServer';
import { dbShiftFromUi, uiShiftFromDb } from '@/lib/shifts';
import { buildLooseSearchWhereSql } from '@/lib/searchSql';

// Types for action results
interface ActionResult<T = unknown> {
    success?: boolean;
    error?: string;
    student?: T;
}

interface StudentFilters {
    page?: number;
    limit?: number;
    branchId?: string;
    search?: string;
}

interface StudentDirectoryFilters {
    academicYearId?: string;
    branchId?: string | null;
    search?: string;
}

interface TeacherStudentFilters {
    teacherId?: string;
    academicYearId?: string;
    branchId?: string;
    className?: string | null;
    shiftName?: string | null;
    division?: string | null;
}

interface NextRollNumberParams {
    academicYearId: string;
    className: string;
    shiftName?: string;
    division: string;
}

interface FeeAmounts {
    term1: number;
    term2: number;
    bookFee: number;
}

type FeeHeadKey = 'term1' | 'term2' | 'bookFee';

interface SerializedStudentBasic {
    _id: string;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    fullName: string;
    branchId: string | null;
    branchName?: string | null;
    dob: string | undefined;
    admissionDate: string | undefined;
    joinedAt: string | undefined;
    feeScholarship: number;
    isActive: boolean;
    createdAt: string | undefined;
    updatedAt: string | undefined;
}

interface StudentDirectoryRow {
    _id: string;
    enrollmentId: string;
    academicYearId: string;
    branchId: string | null;
    admissionNumber?: string;
    name: string;
    rollNumber: string;
    className: string;
    division: string;
    shiftName: string;
    admissionDate: string | undefined;
    gender: string;
    fatherName: string;
    motherName: string;
    parentContact1: string;
    parentContact2: string;
    feeScholarship: number;
    birthPlace: string;
    religion: string;
    address: string;
}

interface StudentDirectoryPageFilters extends StudentDirectoryFilters {
    page?: number;
    pageSize?: number;
    sortModel?: unknown;
    filterModel?: unknown;
}

interface PaginatedResult<T> {
    rows: T[];
    total: number;
}

interface PaginatedStudentsResult {
    data: SerializedStudentBasic[];
    total: number;
    page: number;
    totalPages: number;
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

function yearNameToCode(name: string | null | undefined): string {
    const s = String(name || '').trim();
    // "2025-26" -> "2526"
    const m = s.match(/(\d{2})(\d{2})-(\d{2})/);
    if (m) return `${m[2]}${m[3]}`;
    const digits = s.replace(/[^0-9]/g, '');
    if (digits.length >= 4) return digits.slice(-4);
    return '0000';
}

function splitName(name: string): { firstName: string; lastName: string } {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    const firstName = parts[0] || 'Unknown';
    const lastName = parts.slice(1).join(' ') || firstName;
    return { firstName, lastName };
}

interface GenerateAdmissionNumberParams {
    branchId?: string;
    academicYearId?: string;
}

async function generateAdmissionNumber({ branchId, academicYearId }: GenerateAdmissionNumberParams): Promise<string> {
    const seqKey = `student:${String(branchId || 'none')}:${String(academicYearId || 'none')}`;

    const [branchRows, yearRows, seqRows] = await Promise.all([
        branchId ? sql<Array<{ code: string | null }>>`SELECT code FROM branches WHERE id = ${branchId}::uuid LIMIT 1` : Promise.resolve([]),
        academicYearId ? sql<Array<{ name: string }>>`SELECT name FROM academic_years WHERE id = ${academicYearId}::uuid LIMIT 1` : Promise.resolve([]),
        sql<Array<{ value: number }>>`
            INSERT INTO sequences (key, value, updated_at)
            VALUES (${seqKey}, 1, NOW())
            ON CONFLICT (key)
            DO UPDATE SET value = sequences.value + 1, updated_at = NOW()
            RETURNING value
        `,
    ]);

    const branchCode = (branchRows?.[0]?.code || 'UNK').trim() || 'UNK';
    const yearCode = yearNameToCode(yearRows?.[0]?.name);
    const n = Number(seqRows?.[0]?.value) || 0;
    const padded = String(n).padStart(5, '0');
    return `${branchCode}-${yearCode}-${padded}`.toUpperCase();
}

async function recomputeStudentFeeDuesForScholarship(studentId: string, newScholarshipRaw: number | string | null | undefined): Promise<void> {
    const newScholarship = Number(newScholarshipRaw) || 0;

    const feeRecords = await sql<Array<{
        id: string;
        academic_year_id: string;
        enrollment_id: string | null;
        branch_id: string | null;
        term1_paid: string;
        term2_paid: string;
        book_fee_paid: string;
    }>>`
        SELECT id, academic_year_id, enrollment_id, branch_id, term1_paid, term2_paid, book_fee_paid
        FROM fee_records
        WHERE student_id = ${studentId}::uuid
    `;
    if (!feeRecords?.length) return;

    for (const fr of feeRecords) {
        // Resolve enrollment (prefer stored enrollment_id)
        const enrollmentRows = fr.enrollment_id
            ? await sql<Array<{ class: string; shift_name: string }>>`
                SELECT class, shift_name
                FROM student_enrollments
                WHERE id = ${fr.enrollment_id}::uuid
                LIMIT 1
              `
            : await sql<Array<{ class: string; shift_name: string }>>`
                SELECT class, shift_name
                FROM student_enrollments
                WHERE student_id = ${studentId}::uuid AND academic_year_id = ${fr.academic_year_id}::uuid
                ORDER BY created_at DESC
                LIMIT 1
              `;

        const enrollment = enrollmentRows?.[0];
        if (!enrollment?.class) continue;

        const shiftName = enrollment.shift_name || '';
        const branchId = fr.branch_id || null;

        // Prefer branch-scoped structure, fall back to global
        let fsRows: Array<{ term1_fee: string; term2_fee: string; book_fee: string }> = [];
        if (branchId) {
            fsRows = await sql`
                SELECT term1_fee, term2_fee, book_fee
                FROM fee_structures
                WHERE academic_year_id = ${fr.academic_year_id}::uuid
                  AND branch_id = ${branchId}::uuid
                  AND class = ${enrollment.class}
                  AND shift_name = ${shiftName}
                LIMIT 1
            `;
            if (!fsRows?.length) {
                fsRows = await sql`
                    SELECT term1_fee, term2_fee, book_fee
                    FROM fee_structures
                    WHERE academic_year_id = ${fr.academic_year_id}::uuid
                      AND branch_id = ${branchId}::uuid
                      AND class = ${enrollment.class}
                      AND shift_name = ''
                    LIMIT 1
                `;
            }
        }
        if (!fsRows?.length) {
            fsRows = await sql`
                SELECT term1_fee, term2_fee, book_fee
                FROM fee_structures
                WHERE academic_year_id = ${fr.academic_year_id}::uuid
                  AND branch_id IS NULL
                  AND class = ${enrollment.class}
                  AND shift_name = ${shiftName}
                LIMIT 1
            `;
            if (!fsRows?.length) {
                fsRows = await sql`
                    SELECT term1_fee, term2_fee, book_fee
                    FROM fee_structures
                    WHERE academic_year_id = ${fr.academic_year_id}::uuid
                      AND branch_id IS NULL
                      AND class = ${enrollment.class}
                      AND shift_name = ''
                    LIMIT 1
                `;
            }
        }

        const fs = fsRows?.[0];
        if (!fs) continue;

        const adjusted = applyScholarshipToFeeAmounts(
            { term1: Number(fs.term1_fee) || 0, term2: Number(fs.term2_fee) || 0, bookFee: Number(fs.book_fee) || 0 },
            newScholarship
        );

        const term1Paid = Number(fr.term1_paid) || 0;
        const term2Paid = Number(fr.term2_paid) || 0;
        const bookPaid = Number(fr.book_fee_paid) || 0;

        const term1Status = adjusted.term1 <= 0 ? 'Paid' : term1Paid >= adjusted.term1 ? 'Paid' : term1Paid > 0 ? 'Partial' : 'Pending';
        const term2Status = adjusted.term2 <= 0 ? 'Paid' : term2Paid >= adjusted.term2 ? 'Paid' : term2Paid > 0 ? 'Partial' : 'Pending';
        const bookStatus = adjusted.bookFee <= 0 ? 'Paid' : bookPaid >= adjusted.bookFee ? 'Paid' : bookPaid > 0 ? 'Partial' : 'Pending';

        await sql`
            UPDATE fee_records
            SET
                term1_amount = ${adjusted.term1},
                term1_status = ${term1Status},
                term2_amount = ${adjusted.term2},
                term2_status = ${term2Status},
                book_fee_amount = ${adjusted.bookFee},
                book_fee_status = ${bookStatus},
                updated_at = NOW()
            WHERE id = ${fr.id}::uuid
        `;
    }
}

export async function createStudent(formData: FormData): Promise<ActionResult> {
    const admissionNumberRaw = formData.get('admissionNumber') as string | null;
    const admissionNumber = (admissionNumberRaw || '').trim().toUpperCase();

    const firstName = (formData.get('firstName') as string | null) || null;
    const lastName = (formData.get('lastName') as string | null) || null;
    const admissionDate = formData.get('admissionDate') as string | null;
    const dob = (formData.get('dob') as string | null) || undefined;
    const gender = formData.get('gender') as string | null;

    const birthPlace = (formData.get('birthPlace') as string | null) || undefined;
    const religion = (formData.get('religion') as string | null) || undefined;
    const address = (formData.get('address') as string | null) || undefined;
    const fatherName = (formData.get('fatherName') as string | null) || undefined;
    const motherName = (formData.get('motherName') as string | null) || undefined;
    const parentContact1 = (formData.get('parentContact1') as string | null) || undefined;
    const parentContact2 = (formData.get('parentContact2') as string | null) || undefined;
    const branchId = (formData.get('branchId') as string | null) || undefined;
    const feeScholarship = parseFloat(formData.get('feeScholarship') as string) || 0;

    if (!admissionNumber || !firstName || !lastName || !admissionDate || !gender) {
        return { error: 'Required fields missing' };
    }

    try {
        await dbConnect();

        const existing = await sql<Array<{ id: string }>>`
            SELECT id FROM students WHERE admission_number = ${admissionNumber} LIMIT 1
        `;
        if (existing?.length) {
            return { error: 'Student with this Admission Number already exists' };
        }

        const created = await sql<Array<{ id: string }>>`
            INSERT INTO students (
                admission_number,
                first_name,
                last_name,
                admission_date,
                dob,
                gender,
                birth_place,
                religion,
                address,
                father_name,
                mother_name,
                parent_contact1,
                parent_contact2,
                branch_id,
                fee_scholarship,
                is_active,
                joined_at,
                updated_at
            )
            VALUES (
                ${admissionNumber},
                ${firstName},
                ${lastName},
                ${admissionDate},
                ${dob || null},
                ${gender},
                ${birthPlace || null},
                ${religion || null},
                ${address || null},
                ${fatherName || null},
                ${motherName || null},
                ${parentContact1 || null},
                ${parentContact2 || null},
                ${branchId || null}::uuid,
                ${feeScholarship},
                true,
                ${admissionDate},
                NOW()
            )
            RETURNING id
        `;
        const studentId = created?.[0]?.id;

        await logAudit({
            action: 'create',
            entity: 'student',
            entityId: studentId,
            entityName: `${firstName} ${lastName}`.trim(),
            changes: {
                admissionNumber,
                firstName,
                lastName,
                admissionDate,
                dob,
                gender,
                birthPlace,
                religion,
                address,
                fatherName,
                motherName,
                parentContact1,
                parentContact2,
                branchId,
                feeScholarship,
            },
            performedBy: await getCurrentUsername(),
        });

        revalidatePath('/dashboard/students');
        return { success: true };
    } catch (error) {
        const err = error as Error;
        return { error: err.message || 'Failed to create Student' };
    }
}

// Electron-parity admission flow
export async function admitStudent(formData: FormData): Promise<ActionResult> {
    const name = ((formData.get('name') as string | null) || '').trim();
    const academicYearId = ((formData.get('academicYearId') as string | null) || '').trim();
    const branchId = ((formData.get('branchId') as string | null) || '').trim();
    const className = ((formData.get('class') as string | null) || '').trim();
    const shiftName = ((formData.get('shiftName') as string | null) || '').trim();
    const shiftNameUi = uiShiftFromDb(shiftName);
    const shiftNameDb = dbShiftFromUi(shiftNameUi);
    const division = ((formData.get('division') as string | null) || '').trim();
    const rollNumber = ((formData.get('rollNumber') as string | null) || '').trim();
    const admissionDate = ((formData.get('admissionDate') as string | null) || '').trim();

    const gender = ((formData.get('gender') as string | null) || '').trim();
    const motherName = ((formData.get('motherName') as string | null) || '').trim();
    const fatherName = ((formData.get('fatherName') as string | null) || '').trim();
    const parentContact1 = ((formData.get('parentContact1') as string | null) || '').trim();
    const parentContact2 = ((formData.get('parentContact2') as string | null) || '').trim();
    const birthPlace = ((formData.get('birthPlace') as string | null) || '').trim();
    const religion = ((formData.get('religion') as string | null) || '').trim();
    const address = ((formData.get('address') as string | null) || '').trim();
    const feeScholarship = parseFloat((formData.get('feeScholarship') as string | null) || '0') || 0;

    if (!name || !academicYearId || !branchId || !className || !division || !rollNumber || !admissionDate || !gender) {
        return { error: 'Required fields missing' };
    }

    await dbConnect();

    const yearRows = await sql<Array<{ id: string; name: string }>>`
        SELECT id, name FROM academic_years WHERE id = ${academicYearId}::uuid LIMIT 1
    `;
    if (!yearRows?.length) return { error: 'Invalid Academic Year' };

    // Enforce roll uniqueness for parity (Electron checks within class + division).
    const existingRoll = await sql<Array<{ id: string }>>`
        SELECT id
        FROM student_enrollments
        WHERE academic_year_id = ${academicYearId}::uuid
          AND class = ${className}
          AND shift_name = ${shiftNameDb}
          AND division = ${division}
          AND roll_number = ${rollNumber}
        LIMIT 1
    `;
    if (existingRoll?.length) {
        return { error: 'Roll number already exists in this class and division.' };
    }

    const feeStructureRows = await sql<Array<{ term1_fee: string; term2_fee: string; book_fee: string }>>`
        SELECT term1_fee, term2_fee, book_fee
        FROM fee_structures
        WHERE academic_year_id = ${academicYearId}::uuid
          AND branch_id = ${branchId}::uuid
          AND class = ${className}
          AND shift_name = ${shiftNameDb}
        LIMIT 1
    `;
    const fs = feeStructureRows?.[0] || null;

    const { firstName, lastName } = splitName(name);
    const admissionNumber = await generateAdmissionNumber({ branchId, academicYearId });

    const baseFees: FeeAmounts = {
        term1: Number(fs?.term1_fee) || 0,
        term2: Number(fs?.term2_fee) || 0,
        bookFee: Number(fs?.book_fee) || 0,
    };
    const adjusted = applyScholarshipToFeeAmounts(baseFees, feeScholarship);

    const term1Status = adjusted.term1 <= 0 ? 'Paid' : 'Pending';
    const term2Status = adjusted.term2 <= 0 ? 'Paid' : 'Pending';
    const bookStatus = adjusted.bookFee <= 0 ? 'Paid' : 'Pending';

    const created = await sql<Array<{ student_id: string; enrollment_id: string }>>`
        WITH ins_student AS (
            INSERT INTO students (
                admission_number,
                first_name,
                last_name,
                admission_date,
                joined_at,
                gender,
                father_name,
                mother_name,
                parent_contact1,
                parent_contact2,
                birth_place,
                religion,
                address,
                fee_scholarship,
                branch_id,
                is_active,
                updated_at
            )
            VALUES (
                ${admissionNumber},
                ${firstName},
                ${lastName},
                ${admissionDate},
                ${admissionDate},
                ${gender},
                ${fatherName || null},
                ${motherName || null},
                ${parentContact1 || null},
                ${parentContact2 || null},
                ${birthPlace || null},
                ${religion || null},
                ${address || null},
                ${feeScholarship},
                ${branchId}::uuid,
                true,
                NOW()
            )
            RETURNING id
        ),
        ins_enrollment AS (
            INSERT INTO student_enrollments (
                academic_year_id,
                student_id,
                class,
                shift_name,
                division,
                roll_number,
                status,
                join_date,
                updated_at
            )
            SELECT
                ${academicYearId}::uuid,
                ins_student.id,
                ${className},
                ${shiftNameDb},
                ${division},
                ${rollNumber},
                'Active',
                ${admissionDate}::date,
                NOW()
            FROM ins_student
            RETURNING id, student_id
        ),
        ins_fee_record AS (
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
            SELECT
                ${academicYearId}::uuid,
                ins_enrollment.student_id,
                ins_enrollment.id,
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
            FROM ins_enrollment
            RETURNING id
        )
        SELECT
            (SELECT id FROM ins_student) AS student_id,
            (SELECT id FROM ins_enrollment) AS enrollment_id
    `;

    const createdStudentId = created?.[0]?.student_id;

    await logAudit({
        action: 'create',
        entity: 'student',
        entityId: createdStudentId,
        entityName: `${firstName} ${lastName}`.trim(),
        changes: {
            name,
            academicYearId,
            branchId,
            class: className,
            shiftName: shiftNameUi,
            division,
            rollNumber,
            admissionDate,
            gender,
            feeScholarship,
        },
        performedBy: await getCurrentUsername(),
    });

    revalidatePath('/dashboard/students');
    revalidatePath('/dashboard/enrollment');
    revalidatePath('/dashboard/fees');
    return { success: true };
}

export async function getNextRollNumber({ academicYearId, className, shiftName = '', division }: NextRollNumberParams): Promise<{ next: number }> {
    if (!academicYearId || !className || !division) return { next: 1 };
    await dbConnect();

    const shiftNameDb = dbShiftFromUi(shiftName);
    const rows = await sql<Array<{ max_roll: number | null }>>`
        SELECT MAX(
            CASE
                WHEN roll_number ~ '^[0-9]+$' THEN roll_number::int
                ELSE 0
            END
        )::int AS max_roll
        FROM student_enrollments
        WHERE academic_year_id = ${academicYearId}::uuid
          AND class = ${className}
          AND shift_name = ${shiftNameDb}
          AND division = ${division}
    `;
    const max = rows?.[0]?.max_roll || 0;
    return { next: max + 1 };
}

export async function getStudentDirectoryPage({
    academicYearId,
    branchId = null,
    search = '',
    page = 0,
    pageSize = 25,
    sortModel,
    filterModel,
}: StudentDirectoryPageFilters = {}): Promise<PaginatedResult<StudentDirectoryRow>> {
    if (!academicYearId) return { rows: [], total: 0 };
    await dbConnect();

    const safePage = Number.isFinite(Number(page)) ? Math.max(0, Number(page)) : 0;
    const safePageSize = Number.isFinite(Number(pageSize)) ? Math.min(200, Math.max(5, Number(pageSize))) : 25;
    const offset = safePage * safePageSize;

    const searchWhere = buildLooseSearchWhereSql({
        query: search,
        fields: [
            psql`COALESCE(s.first_name,'')`,
            psql`COALESCE(s.last_name,'')`,
            psql`(COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,''))`,
            psql`COALESCE(s.admission_number,'')`,
            psql`COALESCE(e.roll_number,'')`,
            psql`COALESCE(e.class,'')`,
            psql`COALESCE(e.division,'')`,
            psql`CASE WHEN COALESCE(e.shift_name,'') = '' THEN 'Morning' ELSE e.shift_name END`,
            psql`COALESCE(s.parent_contact1,'')`,
            psql`COALESCE(s.parent_contact2,'')`,
            psql`COALESCE(s.gender,'')`,
            psql`COALESCE(s.father_name,'')`,
            psql`COALESCE(s.mother_name,'')`,
            psql`COALESCE(s.fee_scholarship::text,'')`,
            psql`COALESCE(s.birth_place,'')`,
            psql`COALESCE(s.religion,'')`,
            psql`COALESCE(s.admission_date::text,'')`,
            psql`COALESCE(s.address,'')`,
        ],
    });

    const filterWhere = buildFilterWhereSql(filterModel, {
        name: { expr: psql`(s.first_name || ' ' || s.last_name)` },
        roll_number: { expr: psql`COALESCE(e.roll_number,'')` },
        class_name: { expr: psql`COALESCE(e.class,'')` },
        division: { expr: psql`COALESCE(e.division,'')` },
        shift_name: { expr: psql`CASE WHEN COALESCE(e.shift_name,'') = '' THEN 'Morning' ELSE e.shift_name END` },
        parents_contact1: { expr: psql`COALESCE(s.parent_contact1,'')` },
        parents_contact2: { expr: psql`COALESCE(s.parent_contact2,'')` },
        gender: { expr: psql`COALESCE(s.gender,'')` },
        mother_name: { expr: psql`COALESCE(s.mother_name,'')` },
        father_name: { expr: psql`COALESCE(s.father_name,'')` },
        fee_scholarship: { expr: psql`s.fee_scholarship`, type: 'number' },
        birth_place: { expr: psql`COALESCE(s.birth_place,'')` },
        religion: { expr: psql`COALESCE(s.religion,'')` },
        admission_date: { expr: psql`COALESCE(s.admission_date::text,'')` },
        address: { expr: psql`COALESCE(s.address,'')` },
    });

    const sort = normalizeSortModel(sortModel);
    const orderBy = (() => {
        const dir = sort?.direction === 'desc' ? psql`DESC` : psql`ASC`;
        if (sort?.field === 'name') return psql`ORDER BY (s.first_name || ' ' || s.last_name) ${dir}`;
        if (sort?.field === 'roll_number') return psql`ORDER BY e.roll_number ${dir} NULLS LAST`;
        if (sort?.field === 'class_name') return psql`ORDER BY e.class ${dir}, e.division ASC, e.roll_number ASC NULLS LAST`;
        if (sort?.field === 'parents_contact1') return psql`ORDER BY s.parent_contact1 ${dir} NULLS LAST`;
        if (sort?.field === 'gender') return psql`ORDER BY s.gender ${dir} NULLS LAST`;
        if (sort?.field === 'admission_date') return psql`ORDER BY s.admission_date ${dir} NULLS LAST`;
        return psql`ORDER BY e.class ASC, e.division ASC, e.roll_number ASC NULLS LAST`;
    })();

    const countRows = await querySql<Array<{ total: number }>>(psql`
        SELECT COUNT(*)::int AS total
        FROM student_enrollments e
        JOIN students s ON s.id = e.student_id
        WHERE e.academic_year_id = ${academicYearId}::uuid
          AND e.status = 'Active'
          AND s.is_active = true
          AND (${branchId}::uuid IS NULL OR s.branch_id = ${branchId}::uuid)
          ${searchWhere}
          ${filterWhere}
    `);
    const total = countRows?.[0]?.total || 0;

    const rows = await querySql<Array<{
        student_id: string;
        enrollment_id: string;
        academic_year_id: string;
        branch_id: string | null;
        admission_number: string | null;
        first_name: string;
        last_name: string;
        roll_number: string | null;
        class: string;
        division: string;
        shift_name: string;
        admission_date: string;
        joined_at: string;
        gender: string;
        father_name: string | null;
        mother_name: string | null;
        parent_contact1: string | null;
        parent_contact2: string | null;
        fee_scholarship: string;
        birth_place: string | null;
        religion: string | null;
        address: string | null;
    }>>(psql`
        SELECT
            s.id AS student_id,
            e.id AS enrollment_id,
            e.academic_year_id,
            s.branch_id,
            s.admission_number,
            s.first_name,
            s.last_name,
            e.roll_number,
            e.class,
            e.division,
            e.shift_name,
            s.admission_date,
            s.joined_at,
            s.gender,
            s.father_name,
            s.mother_name,
            s.parent_contact1,
            s.parent_contact2,
            s.fee_scholarship,
            s.birth_place,
            s.religion,
            s.address
        FROM student_enrollments e
        JOIN students s ON s.id = e.student_id
        WHERE e.academic_year_id = ${academicYearId}::uuid
          AND e.status = 'Active'
          AND s.is_active = true
          AND (${branchId}::uuid IS NULL OR s.branch_id = ${branchId}::uuid)
          ${searchWhere}
          ${filterWhere}
        ${orderBy}
        LIMIT ${safePageSize}
        OFFSET ${offset}
    `);

    const mapped = rows.map((r) => {
        const fullName = `${r.first_name || ''} ${r.last_name || ''}`.trim();
        return {
            _id: r.student_id,
            enrollmentId: r.enrollment_id,
            academicYearId: r.academic_year_id,
            branchId: r.branch_id,
            admissionNumber: r.admission_number || '',
            name: fullName,
            rollNumber: r.roll_number || '',
            className: r.class || '',
            division: r.division || '',
            shiftName: uiShiftFromDb(r.shift_name),
            admissionDate: dateToISOString(r.admission_date || r.joined_at, { dateOnly: true }),
            gender: r.gender || '',
            fatherName: r.father_name || '',
            motherName: r.mother_name || '',
            parentContact1: r.parent_contact1 || '',
            parentContact2: r.parent_contact2 || '',
            feeScholarship: Number(r.fee_scholarship) || 0,
            birthPlace: r.birth_place || '',
            religion: r.religion || '',
            address: r.address || '',
        };
    });

    return { rows: mapped, total };
}

// Teacher-wise student report (filters by teacher assignments).
export async function getStudentsByTeacher({
    teacherId,
    academicYearId,
    branchId,
    className = null,
    shiftName = null,
    division = null,
}: TeacherStudentFilters = {}): Promise<StudentDirectoryRow[]> {
    if (!teacherId || !academicYearId || !branchId) return [];
    await dbConnect();

    const teacherRows = await sql<Array<{ staff_type: string; assignments: unknown }>>`
        SELECT staff_type, assignments
        FROM staff
        WHERE id = ${teacherId}::uuid
        LIMIT 1
    `;
    const teacher = teacherRows?.[0];
    if (!teacher || teacher.staff_type !== 'teacher') return [];

    const assignments: any[] = Array.isArray(teacher.assignments) ? (teacher.assignments as any[]) : [];
    const classEntryIds = assignments.map((a) => String(a?.classEntryId || '').trim()).filter(Boolean);

    const structuresById = new Map<string, { className: string; shiftName: string; branchId: string | null }>();
    if (classEntryIds.length) {
        const structures = await sql<Array<{ id: string; class: string; shift_name: string; branch_id: string | null }>>`
            SELECT id, class, shift_name, branch_id
            FROM fee_structures
            WHERE id = ANY(${classEntryIds}::uuid[])
        `;
        for (const s of structures) {
            structuresById.set(s.id, { className: s.class || '', shiftName: uiShiftFromDb(s.shift_name), branchId: s.branch_id });
        }
    }

    // Build allowed class/shift combos and division constraints
    type ClassEntry = { className: string; shiftName: string; allDivisions: boolean; divisions: Set<string> };
    const byClassKey = new Map<string, ClassEntry>();
    for (const a of assignments) {
        const resolved = (() => {
            const id = String(a?.classEntryId || '').trim();
            if (id && structuresById.has(id)) return structuresById.get(id)!;
            return {
                className: String(a?.className || a?.class_name || '').trim(),
                shiftName: uiShiftFromDb(String(a?.shiftName || a?.shift_name || '').trim()),
                branchId: a?.branchId ? String(a.branchId) : null,
            };
        })();

        if (resolved.branchId && String(resolved.branchId) !== String(branchId)) continue;

        const cls = (resolved.className || '').trim();
        if (!cls) continue;
        const shift = (resolved.shiftName || '').trim();
        const key = `${cls}|||${shift}`;
        if (!byClassKey.has(key)) byClassKey.set(key, { className: cls, shiftName: shift, allDivisions: false, divisions: new Set() });
        const entry = byClassKey.get(key)!;
        const div = String(a?.division || '').trim().toUpperCase();
        if (!div) entry.allDivisions = true;
        else entry.divisions.add(div);
    }

    let allowed = Array.from(byClassKey.values());
    if (className) {
        const shiftFilter = shiftName == null ? null : uiShiftFromDb(shiftName);
        allowed = allowed.filter((x) => String(x.className) === String(className) && String(x.shiftName || '') === String(shiftFilter || ''));
    }
    if (!allowed.length) return [];

    const divisionFilter = String(division || '').trim().toUpperCase();

    // Fetch enrollments for this year + branch, then filter in JS to preserve teacher-division rules.
    const enrollments = await sql<Array<{
        enrollment_id: string;
        class: string;
        division: string;
        shift_name: string;
        roll_number: string | null;
        student_id: string;
        first_name: string;
        last_name: string;
        admission_date: string;
        joined_at: string;
        parent_contact1: string | null;
        parent_contact2: string | null;
        gender: string;
        fee_scholarship: string;
        birth_place: string | null;
        religion: string | null;
        address: string | null;
        branch_id: string | null;
    }>>`
        SELECT
            e.id AS enrollment_id,
            e.class,
            e.division,
            e.shift_name,
            e.roll_number,
            s.id AS student_id,
            s.first_name,
            s.last_name,
            s.admission_date,
            s.joined_at,
            s.parent_contact1,
            s.parent_contact2,
            s.gender,
            s.fee_scholarship,
            s.birth_place,
            s.religion,
            s.address,
            s.branch_id
        FROM student_enrollments e
        JOIN students s ON s.id = e.student_id
        WHERE e.academic_year_id = ${academicYearId}::uuid
          AND e.status = 'Active'
          AND s.is_active = true
          AND s.branch_id = ${branchId}::uuid
        ORDER BY e.class ASC, e.division ASC, e.roll_number ASC NULLS LAST
    `;

    const allowedByKey = new Map<string, ClassEntry>();
    for (const a of allowed) allowedByKey.set(`${a.className}|||${a.shiftName || ''}`, a);

    return enrollments
        .filter((e) => {
            const key = `${e.class}|||${uiShiftFromDb(e.shift_name)}`;
            const entry = allowedByKey.get(key);
            if (!entry) return false;

            const div = String(e.division || '').trim().toUpperCase();
            if (divisionFilter) {
                if (div !== divisionFilter) return false;
                if (!entry.allDivisions && entry.divisions.size > 0 && !entry.divisions.has(divisionFilter)) return false;
                return true;
            }

            if (!entry.allDivisions && entry.divisions.size > 0) {
                return entry.divisions.has(div);
            }
            return true;
        })
        .map((e) => {
            const fullName = `${e.first_name || ''} ${e.last_name || ''}`.trim();
            return {
                _id: e.student_id,
                enrollmentId: e.enrollment_id,
                academicYearId,
                branchId: e.branch_id,
                name: fullName,
                rollNumber: e.roll_number || '',
                className: e.class || '',
                division: e.division || '',
                shiftName: uiShiftFromDb(e.shift_name),
                admissionDate: dateToISOString(e.admission_date || e.joined_at, { dateOnly: true }),
                gender: e.gender || '',
                fatherName: '',
                motherName: '',
                parentContact1: e.parent_contact1 || '',
                parentContact2: e.parent_contact2 || '',
                feeScholarship: Number(e.fee_scholarship) || 0,
                birthPlace: e.birth_place || '',
                religion: e.religion || '',
                address: e.address || '',
            };
        });
}

export async function updateAdmittedStudent(studentId: string, formData: FormData): Promise<ActionResult> {
    await dbConnect();

    const name = ((formData.get('name') as string | null) || '').trim();
    const className = ((formData.get('class') as string | null) || '').trim();
    const shiftName = ((formData.get('shiftName') as string | null) || '').trim();
    const shiftNameUi = uiShiftFromDb(shiftName);
    const shiftNameDb = dbShiftFromUi(shiftNameUi);
    const division = ((formData.get('division') as string | null) || '').trim();
    const rollNumber = ((formData.get('rollNumber') as string | null) || '').trim();
    const admissionDate = ((formData.get('admissionDate') as string | null) || '').trim();

    const gender = ((formData.get('gender') as string | null) || '').trim();
    const motherName = ((formData.get('motherName') as string | null) || '').trim();
    const fatherName = ((formData.get('fatherName') as string | null) || '').trim();
    const parentContact1 = ((formData.get('parentContact1') as string | null) || '').trim();
    const parentContact2 = ((formData.get('parentContact2') as string | null) || '').trim();
    const birthPlace = ((formData.get('birthPlace') as string | null) || '').trim();
    const religion = ((formData.get('religion') as string | null) || '').trim();
    const address = ((formData.get('address') as string | null) || '').trim();
    const feeScholarship = parseFloat((formData.get('feeScholarship') as string | null) || '0') || 0;

    if (!studentId || !name || !className || !division || !rollNumber || !admissionDate || !gender) {
        return { error: 'Required fields missing' };
    }

    const academicYearId = String(formData.get('academicYearId') || '').trim();
    if (!academicYearId) return { error: 'Academic year is required' };

    const studentRows = await sql<Array<{ id: string; branch_id: string | null }>>`
        SELECT id, branch_id
        FROM students
        WHERE id = ${studentId}::uuid
        LIMIT 1
    `;
    const student = studentRows?.[0];
    if (!student) return { error: 'Student not found' };

    const enrollmentRows = await sql<Array<{ id: string }>>`
        SELECT id
        FROM student_enrollments
        WHERE academic_year_id = ${academicYearId}::uuid AND student_id = ${studentId}::uuid
        LIMIT 1
    `;
    const enrollmentId = enrollmentRows?.[0]?.id;
    if (!enrollmentId) return { error: 'Enrollment not found for this year' };

    const existingRoll = await sql<Array<{ id: string }>>`
        SELECT id
        FROM student_enrollments
        WHERE academic_year_id = ${academicYearId}::uuid
          AND class = ${className}
          AND shift_name = ${shiftNameDb}
          AND division = ${division}
          AND roll_number = ${rollNumber}
          AND id <> ${enrollmentId}::uuid
        LIMIT 1
    `;
    if (existingRoll?.length) return { error: 'Roll number already exists in this class and division.' };

    const { firstName, lastName } = splitName(name);

    await sql`
        UPDATE students
        SET
            first_name = ${firstName},
            last_name = ${lastName},
            admission_date = ${admissionDate},
            joined_at = ${admissionDate},
            gender = ${gender},
            father_name = ${fatherName || null},
            mother_name = ${motherName || null},
            parent_contact1 = ${parentContact1 || null},
            parent_contact2 = ${parentContact2 || null},
            birth_place = ${birthPlace || null},
            religion = ${religion || null},
            address = ${address || null},
            fee_scholarship = ${feeScholarship},
            updated_at = NOW()
        WHERE id = ${studentId}::uuid
    `;

    await sql`
        UPDATE student_enrollments
        SET
            class = ${className},
            shift_name = ${shiftNameDb},
            division = ${division},
            roll_number = ${rollNumber},
            updated_at = NOW()
        WHERE id = ${enrollmentId}::uuid
    `;

    // Keep fee dues consistent if class or scholarship changed.
    const feeRecordRows = await sql<Array<{
        id: string;
        term1_paid: string;
        term2_paid: string;
        book_fee_paid: string;
    }>>`
        SELECT id, term1_paid, term2_paid, book_fee_paid
        FROM fee_records
        WHERE academic_year_id = ${academicYearId}::uuid AND student_id = ${studentId}::uuid
        LIMIT 1
    `;
    const fr = feeRecordRows?.[0] || null;
    if (fr) {
        const fsRows = await sql<Array<{ term1_fee: string; term2_fee: string; book_fee: string }>>`
            SELECT term1_fee, term2_fee, book_fee
            FROM fee_structures
            WHERE academic_year_id = ${academicYearId}::uuid
              AND branch_id = ${student.branch_id}::uuid
              AND class = ${className}
              AND shift_name = ${shiftNameDb}
            LIMIT 1
        `;
        const fs = fsRows?.[0] || null;
        const base: FeeAmounts = {
            term1: Number(fs?.term1_fee) || 0,
            term2: Number(fs?.term2_fee) || 0,
            bookFee: Number(fs?.book_fee) || 0,
        };
        const adjusted = applyScholarshipToFeeAmounts(base, feeScholarship);

        const term1Paid = Number(fr.term1_paid) || 0;
        const term2Paid = Number(fr.term2_paid) || 0;
        const bookPaid = Number(fr.book_fee_paid) || 0;

        const term1Status = adjusted.term1 <= 0 ? 'Paid' : term1Paid >= adjusted.term1 ? 'Paid' : term1Paid > 0 ? 'Partial' : 'Pending';
        const term2Status = adjusted.term2 <= 0 ? 'Paid' : term2Paid >= adjusted.term2 ? 'Paid' : term2Paid > 0 ? 'Partial' : 'Pending';
        const bookStatus = adjusted.bookFee <= 0 ? 'Paid' : bookPaid >= adjusted.bookFee ? 'Paid' : bookPaid > 0 ? 'Partial' : 'Pending';

        await sql`
            UPDATE fee_records
            SET
                term1_amount = ${adjusted.term1},
                term2_amount = ${adjusted.term2},
                book_fee_amount = ${adjusted.bookFee},
                term1_status = ${term1Status},
                term2_status = ${term2Status},
                book_fee_status = ${bookStatus},
                updated_at = NOW()
            WHERE id = ${fr.id}::uuid
        `;
    }

    await logAudit({
        action: 'update',
        entity: 'student',
        entityId: studentId,
        entityName: `${firstName} ${lastName}`.trim(),
        changes: { name, class: className, shiftName: shiftNameUi, division, rollNumber, admissionDate, gender, feeScholarship },
        performedBy: await getCurrentUsername(),
    });

    revalidatePath('/dashboard/students');
    revalidatePath('/dashboard/fees');
    revalidatePath('/dashboard/enrollment');
    return { success: true };
}

export async function getStudents(filters: StudentFilters = {}): Promise<PaginatedStudentsResult> {
    await dbConnect();

    const page = filters.page || 1;
    const limit = filters.limit || 25;
    const offset = (page - 1) * limit;
    const branchId = filters.branchId || null;
    const search = (filters.search || '').trim();

    const searchWhere = buildLooseSearchWhereSql({
        query: search,
        fields: [
            psql`COALESCE(s.first_name,'')`,
            psql`COALESCE(s.last_name,'')`,
            psql`(COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,''))`,
            psql`COALESCE(s.admission_number,'')`,
        ],
    });

    const [students, totals] = await Promise.all([
        sql<Array<{
            id: string;
            admission_number: string;
            first_name: string;
            last_name: string;
            branch_id: string | null;
            branch_name: string | null;
            dob: string | null;
            admission_date: string;
            joined_at: string;
            fee_scholarship: string;
            is_active: boolean;
            created_at: string;
            updated_at: string;
        }>>`
            SELECT
                s.id,
                s.admission_number,
                s.first_name,
                s.last_name,
                s.branch_id,
                b.name AS branch_name,
                s.dob,
                s.admission_date,
                s.joined_at,
                s.fee_scholarship,
                s.is_active,
                s.created_at,
                s.updated_at
            FROM students s
            LEFT JOIN branches b ON b.id = s.branch_id
            WHERE s.is_active = true
              AND (${branchId}::uuid IS NULL OR s.branch_id = ${branchId}::uuid)
              ${searchWhere}
            ORDER BY s.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `,
        sql<Array<{ total: number }>>`
            SELECT COUNT(*)::int AS total
            FROM students s
            WHERE s.is_active = true
              AND (${branchId}::uuid IS NULL OR s.branch_id = ${branchId}::uuid)
              ${searchWhere}
        `,
    ]);

    const total = totals?.[0]?.total || 0;

    const data: SerializedStudentBasic[] = students.map((s) => ({
        _id: s.id,
        admissionNumber: s.admission_number || '',
        firstName: s.first_name || '',
        lastName: s.last_name || '',
        fullName: `${s.first_name || ''} ${s.last_name || ''}`.trim(),
        branchId: s.branch_id,
        branchName: s.branch_name,
        admissionDate: dateToISOString(s.admission_date || s.joined_at || s.dob, { dateOnly: true }),
        dob: dateToISOString(s.dob, { dateOnly: true }),
        joinedAt: dateToISOString(s.joined_at, { dateOnly: true }),
        feeScholarship: Number(s.fee_scholarship) || 0,
        isActive: !!s.is_active,
        createdAt: dateToISOString(s.created_at),
        updatedAt: dateToISOString(s.updated_at),
    }));

    return {
        data,
        total,
        page,
        totalPages: Math.ceil(total / limit),
    };
}

interface SerializedStudentDetail extends SerializedStudentBasic {
    gender?: string;
    birthPlace?: string;
    religion?: string;
    address?: string;
    fatherName?: string;
    motherName?: string;
    parentContact1?: string;
    parentContact2?: string;
}

export async function getStudentById(id: string): Promise<SerializedStudentDetail | null> {
    await dbConnect();

    const rows = await sql<Array<{
        id: string;
        admission_number: string;
        first_name: string;
        last_name: string;
        branch_id: string | null;
        branch_name: string | null;
        dob: string | null;
        admission_date: string;
        joined_at: string;
        fee_scholarship: string;
        is_active: boolean;
        created_at: string;
        updated_at: string;
        gender: string;
        birth_place: string | null;
        religion: string | null;
        address: string | null;
        father_name: string | null;
        mother_name: string | null;
        parent_contact1: string | null;
        parent_contact2: string | null;
    }>>`
        SELECT
            s.id,
            s.admission_number,
            s.first_name,
            s.last_name,
            s.branch_id,
            b.name AS branch_name,
            s.dob,
            s.admission_date,
            s.joined_at,
            s.fee_scholarship,
            s.is_active,
            s.created_at,
            s.updated_at,
            s.gender,
            s.birth_place,
            s.religion,
            s.address,
            s.father_name,
            s.mother_name,
            s.parent_contact1,
            s.parent_contact2
        FROM students s
        LEFT JOIN branches b ON b.id = s.branch_id
        WHERE s.id = ${id}
        LIMIT 1
    `;
    const s = rows?.[0];
    if (!s) return null;

    return {
        _id: s.id,
        admissionNumber: s.admission_number || '',
        firstName: s.first_name || '',
        lastName: s.last_name || '',
        fullName: `${s.first_name || ''} ${s.last_name || ''}`.trim(),
        branchId: s.branch_id,
        branchName: s.branch_name,
        admissionDate: dateToISOString(s.admission_date || s.joined_at || s.dob, { dateOnly: true }),
        dob: dateToISOString(s.dob, { dateOnly: true }),
        joinedAt: dateToISOString(s.joined_at, { dateOnly: true }),
        feeScholarship: Number(s.fee_scholarship) || 0,
        isActive: !!s.is_active,
        createdAt: dateToISOString(s.created_at),
        updatedAt: dateToISOString(s.updated_at),
        gender: s.gender || '',
        birthPlace: s.birth_place || '',
        religion: s.religion || '',
        address: s.address || '',
        fatherName: s.father_name || '',
        motherName: s.mother_name || '',
        parentContact1: s.parent_contact1 || '',
        parentContact2: s.parent_contact2 || '',
    };
}

export async function updateStudent(id: string, formData: FormData): Promise<ActionResult> {
    await dbConnect();

    const fields = [
        'admissionNumber',
        'firstName',
        'lastName',
        'admissionDate',
        'dob',
        'gender',
        'birthPlace',
        'religion',
        'address',
        'fatherName',
        'motherName',
        'parentContact1',
        'parentContact2',
        'branchId',
        'feeScholarship',
    ] as const;

    const data: Record<string, any> = {};
    for (const field of fields) {
        const value = formData.get(field) as string | null;
        if (value === null || value === undefined || value === '') continue;
        if (field === 'feeScholarship') data[field] = parseFloat(value) || 0;
        else if (field === 'admissionDate' || field === 'dob') data[field] = value;
        else if (field === 'admissionNumber') data[field] = String(value).trim().toUpperCase();
        else data[field] = value;
    }

    try {
        const oldRows = await sql<Array<Record<string, any>>>`SELECT * FROM students WHERE id = ${id}::uuid LIMIT 1`;
        const oldStudent = oldRows?.[0] || null;

        const hasAdmissionNumber = Object.prototype.hasOwnProperty.call(data, 'admissionNumber');
        const hasFirstName = Object.prototype.hasOwnProperty.call(data, 'firstName');
        const hasLastName = Object.prototype.hasOwnProperty.call(data, 'lastName');
        const hasAdmissionDate = Object.prototype.hasOwnProperty.call(data, 'admissionDate');
        const hasDob = Object.prototype.hasOwnProperty.call(data, 'dob');
        const hasGender = Object.prototype.hasOwnProperty.call(data, 'gender');
        const hasBirthPlace = Object.prototype.hasOwnProperty.call(data, 'birthPlace');
        const hasReligion = Object.prototype.hasOwnProperty.call(data, 'religion');
        const hasAddress = Object.prototype.hasOwnProperty.call(data, 'address');
        const hasFatherName = Object.prototype.hasOwnProperty.call(data, 'fatherName');
        const hasMotherName = Object.prototype.hasOwnProperty.call(data, 'motherName');
        const hasParentContact1 = Object.prototype.hasOwnProperty.call(data, 'parentContact1');
        const hasParentContact2 = Object.prototype.hasOwnProperty.call(data, 'parentContact2');
        const hasBranchId = Object.prototype.hasOwnProperty.call(data, 'branchId');
        const hasFeeScholarship = Object.prototype.hasOwnProperty.call(data, 'feeScholarship');

        const updated = await sql<Array<{ id: string; first_name: string; last_name: string }>>`
            UPDATE students
            SET
                admission_number = CASE WHEN ${hasAdmissionNumber}::boolean THEN ${data.admissionNumber} ELSE admission_number END,
                first_name = CASE WHEN ${hasFirstName}::boolean THEN ${data.firstName} ELSE first_name END,
                last_name = CASE WHEN ${hasLastName}::boolean THEN ${data.lastName} ELSE last_name END,
                admission_date = CASE WHEN ${hasAdmissionDate}::boolean THEN ${data.admissionDate}::date ELSE admission_date END,
                dob = CASE WHEN ${hasDob}::boolean THEN ${data.dob}::date ELSE dob END,
                gender = CASE WHEN ${hasGender}::boolean THEN ${data.gender} ELSE gender END,
                birth_place = CASE WHEN ${hasBirthPlace}::boolean THEN ${data.birthPlace} ELSE birth_place END,
                religion = CASE WHEN ${hasReligion}::boolean THEN ${data.religion} ELSE religion END,
                address = CASE WHEN ${hasAddress}::boolean THEN ${data.address} ELSE address END,
                father_name = CASE WHEN ${hasFatherName}::boolean THEN ${data.fatherName} ELSE father_name END,
                mother_name = CASE WHEN ${hasMotherName}::boolean THEN ${data.motherName} ELSE mother_name END,
                parent_contact1 = CASE WHEN ${hasParentContact1}::boolean THEN ${data.parentContact1} ELSE parent_contact1 END,
                parent_contact2 = CASE WHEN ${hasParentContact2}::boolean THEN ${data.parentContact2} ELSE parent_contact2 END,
                branch_id = CASE WHEN ${hasBranchId}::boolean THEN ${data.branchId}::uuid ELSE branch_id END,
                fee_scholarship = CASE WHEN ${hasFeeScholarship}::boolean THEN ${data.feeScholarship} ELSE fee_scholarship END,
                updated_at = NOW()
            WHERE id = ${id}::uuid
            RETURNING id, first_name, last_name
        `;

        if (!updated?.length) return { error: 'Student not found' };

        if (hasFeeScholarship) {
            await recomputeStudentFeeDuesForScholarship(id, data.feeScholarship as number);
        }

        const changes = Object.keys(data).reduce((acc, key) => {
            const oldKey = (() => {
                // map camelCase form to db columns for diff display
                const map: Record<string, string> = {
                    admissionNumber: 'admission_number',
                    firstName: 'first_name',
                    lastName: 'last_name',
                    admissionDate: 'admission_date',
                    birthPlace: 'birth_place',
                    fatherName: 'father_name',
                    motherName: 'mother_name',
                    parentContact1: 'parent_contact1',
                    parentContact2: 'parent_contact2',
                    branchId: 'branch_id',
                    feeScholarship: 'fee_scholarship',
                };
                return map[key] || key;
            })();
            if (oldStudent && JSON.stringify(oldStudent[oldKey]) !== JSON.stringify(data[key])) {
                acc[key] = { old: oldStudent[oldKey], new: data[key] };
            }
            return acc;
        }, {} as Record<string, { old: unknown; new: unknown }>);

        await logAudit({
            action: 'update',
            entity: 'student',
            entityId: id,
            entityName: `${updated[0].first_name} ${updated[0].last_name}`.trim(),
            changes,
            performedBy: await getCurrentUsername(),
        });

        revalidatePath('/dashboard/students');
        return { success: true };
    } catch (error) {
        const err = error as Error;
        return { error: err.message || 'Failed to update Student' };
    }
}

export async function deleteStudent(id: string): Promise<ActionResult> {
    await dbConnect();

    try {
        const updated = await sql<Array<{ id: string; first_name: string; last_name: string }>>`
            UPDATE students
            SET is_active = false, updated_at = NOW()
            WHERE id = ${id}::uuid
            RETURNING id, first_name, last_name
        `;
        if (!updated?.length) return { error: 'Student not found' };

        await logAudit({
            action: 'delete',
            entity: 'student',
            entityId: id,
            entityName: `${updated[0].first_name} ${updated[0].last_name}`.trim(),
            performedBy: await getCurrentUsername(),
        });

        revalidatePath('/dashboard/students');
        return { success: true };
    } catch (error) {
        const err = error as Error;
        return { error: err.message || 'Failed to delete Student' };
    }
}

export async function searchStudents(query: string, branchId: string | null = null, limit: number = 50): Promise<SerializedStudentBasic[]> {
    await dbConnect();

    const q = String(query || '').trim();
    if (!q) return [];

    const searchWhere = buildLooseSearchWhereSql({
        query: q,
        fields: [
            psql`COALESCE(first_name,'')`,
            psql`COALESCE(last_name,'')`,
            psql`(COALESCE(first_name,'') || ' ' || COALESCE(last_name,''))`,
            psql`COALESCE(admission_number,'')`,
        ],
    });

    const rows = await sql<Array<{
        id: string;
        admission_number: string;
        first_name: string;
        last_name: string;
        branch_id: string | null;
        dob: string | null;
        admission_date: string;
        joined_at: string;
        fee_scholarship: string;
        is_active: boolean;
        created_at: string;
        updated_at: string;
    }>>`
        SELECT id, admission_number, first_name, last_name, branch_id, dob, admission_date, joined_at, fee_scholarship, is_active, created_at, updated_at
        FROM students
        WHERE is_active = true
          AND (${branchId}::uuid IS NULL OR branch_id = ${branchId}::uuid)
          ${searchWhere}
        ORDER BY created_at DESC
        LIMIT ${limit}
    `;

    return rows.map((s) => ({
        _id: s.id,
        admissionNumber: s.admission_number || '',
        firstName: s.first_name || '',
        lastName: s.last_name || '',
        fullName: `${s.first_name} ${s.last_name}`.trim(),
        branchId: s.branch_id,
        dob: dateToISOString(s.dob, { dateOnly: true }),
        admissionDate: dateToISOString(s.admission_date, { dateOnly: true }),
        joinedAt: dateToISOString(s.joined_at),
        feeScholarship: Number(s.fee_scholarship) || 0,
        isActive: !!s.is_active,
        createdAt: dateToISOString(s.created_at),
        updatedAt: dateToISOString(s.updated_at),
    }));
}

export async function getStudentCount(branchId: string | null = null): Promise<number> {
    await dbConnect();
    const rows = await sql<Array<{ total: number }>>`
        SELECT COUNT(*)::int AS total
        FROM students
        WHERE is_active = true
          AND (${branchId}::uuid IS NULL OR branch_id = ${branchId}::uuid)
    `;
    return rows?.[0]?.total || 0;
}
