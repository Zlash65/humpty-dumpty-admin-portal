'use server';

import dbConnect from '@/lib/db';
import { dateToISOString, idToString, pickRefName } from '@/lib/serialize';
import Student from '@/models/Student';
import FeeRecord from '@/models/FeeRecord';
import FeeStructure from '@/models/FeeStructure';
import StudentEnrollment from '@/models/StudentEnrollment';
import AcademicYear from '@/models/AcademicYear';
import Branch from '@/models/Branch';
import Sequence from '@/models/Sequence';
import Staff from '@/models/Staff';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { getCurrentUsername } from '@/lib/currentUser';
import type { IStudentDocument, IFeeRecordDocument, IFeeStructureDocument, IStudentEnrollmentDocument, IStaffDocument } from '@/types';
import type { FilterQuery, Types } from 'mongoose';

// Types for action results
interface ActionResult<T = void> {
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
    section?: string | null;
}

interface NextRollNumberParams {
    academicYearId: string;
    className: string;
    shiftName?: string;
    section: string;
}

interface FeeAmounts {
    term1: number;
    term2: number;
    bookFee: number;
}

interface SerializedStudentBasic {
    _id: string;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    fullName: string;
    branchId: string | null;
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
    name: string;
    rollNumber: string;
    className: string;
    section: string;
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

interface PaginatedStudentsResult {
    data: SerializedStudentBasic[];
    total: number;
    page: number;
    totalPages: number;
}

type FeeHeadKey = 'term1' | 'term2' | 'bookFee';

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

interface GenerateAdmissionNumberParams {
    branchId?: string;
    academicYearId?: string;
}

async function generateAdmissionNumber({ branchId, academicYearId }: GenerateAdmissionNumberParams): Promise<string> {
    const [branch, year, seq] = await Promise.all([
        branchId ? Branch.findById(branchId).select('code').lean() : null,
        academicYearId ? AcademicYear.findById(academicYearId).select('name').lean() : null,
        Sequence.findOneAndUpdate(
            { key: `student:${String(branchId || 'none')}:${String(academicYearId || 'none')}` },
            { $inc: { value: 1 } },
            { upsert: true, new: true }
        ).lean(),
    ]);

    const branchCode = (branch as { code?: string } | null)?.code || 'UNK';
    const yearCode = yearNameToCode((year as { name?: string } | null)?.name);
    const n = (seq as { value?: number } | null)?.value || 0;
    const padded = String(n).padStart(5, '0');
    return `${branchCode}-${yearCode}-${padded}`;
}

async function recomputeStudentFeeDuesForScholarship(studentId: string | Types.ObjectId, newScholarshipRaw: number | string | null | undefined): Promise<void> {
    const newScholarship = Number(newScholarshipRaw) || 0;
    const feeRecords = await FeeRecord.find({ studentId }).lean();
    if (!feeRecords.length) return;

    for (const fr of feeRecords) {
        const enrollment =
            (fr.enrollmentId && (await StudentEnrollment.findById(fr.enrollmentId).lean())) ||
            (await StudentEnrollment.findOne({ studentId, academicYearId: fr.academicYearId }).lean());
        if (!enrollment?.class) continue;

        const branchId = fr.branchId || undefined;
        const shiftName = enrollment.shiftName || '';

        const feeStructure =
            (branchId &&
                ((await FeeStructure.findOne({ academicYearId: fr.academicYearId, branchId, class: enrollment.class, shiftName })) ||
                    (await FeeStructure.findOne({ academicYearId: fr.academicYearId, branchId, class: enrollment.class, shiftName: '' })))) ||
            (await FeeStructure.findOne({ academicYearId: fr.academicYearId, class: enrollment.class, shiftName })) ||
            (await FeeStructure.findOne({ academicYearId: fr.academicYearId, class: enrollment.class, shiftName: '' }));

        if (!feeStructure) continue;

        const adjusted = applyScholarshipToFeeAmounts(
            {
                term1: feeStructure.components.term1,
                term2: feeStructure.components.term2,
                bookFee: feeStructure.components.bookFee,
            },
            newScholarship
        );

        interface FeeHead {
            amount: number;
            paid?: number;
            status: string;
        }

        const nextFees: Record<FeeHeadKey, FeeHead> = {
            term1: { ...(fr.fees?.term1 as FeeHead), amount: adjusted.term1 },
            term2: { ...(fr.fees?.term2 as FeeHead), amount: adjusted.term2 },
            bookFee: { ...(fr.fees?.bookFee as FeeHead), amount: adjusted.bookFee },
        };

        const heads: FeeHeadKey[] = ['term1', 'term2', 'bookFee'];
        for (const head of heads) {
            const paid = Number(nextFees[head]?.paid) || 0;
            const amount = Number(nextFees[head]?.amount) || 0;
            if (amount <= 0) {
                nextFees[head].status = 'Paid';
                continue;
            }
            nextFees[head].status = paid >= amount ? 'Paid' : paid > 0 ? 'Partial' : 'Pending';
        }

        await FeeRecord.updateOne({ _id: fr._id }, { $set: { fees: nextFees } });
    }
}

export async function createStudent(formData: FormData): Promise<ActionResult<IStudentDocument>> {
    const data = {
        admissionNumber: formData.get('admissionNumber') as string | null,
        firstName: formData.get('firstName') as string | null,
        lastName: formData.get('lastName') as string | null,
        admissionDate: formData.get('admissionDate') as string | null,
        dob: (formData.get('dob') as string | null) || undefined,
        gender: formData.get('gender') as string | null,
        birthPlace: (formData.get('birthPlace') as string | null) || undefined,
        religion: (formData.get('religion') as string | null) || undefined,
        address: (formData.get('address') as string | null) || undefined,
        fatherName: (formData.get('fatherName') as string | null) || undefined,
        motherName: (formData.get('motherName') as string | null) || undefined,
        parentContact1: (formData.get('parentContact1') as string | null) || undefined,
        parentContact2: (formData.get('parentContact2') as string | null) || undefined,
        branchId: (formData.get('branchId') as string | null) || undefined,
        feeScholarship: parseFloat(formData.get('feeScholarship') as string) || 0,
    };

    // Validate required fields
    if (!data.admissionNumber || !data.firstName || !data.lastName || !data.admissionDate || !data.gender) {
        return { error: 'Required fields missing' };
    }

    try {
        await dbConnect();

        // Check duplicate admission number
        const existing = await Student.findOne({ admissionNumber: data.admissionNumber });
        if (existing) {
            return { error: 'Student with this Admission Number already exists' };
        }

        const student = await Student.create({
            ...data,
            admissionDate: new Date(data.admissionDate),
            ...(data.dob ? { dob: new Date(data.dob) } : {}),
            // Maintain backwards compat for existing code/data that used `joinedAt` as admission date.
            joinedAt: new Date(data.admissionDate),
            isActive: true,
        });

        await logAudit({
            action: 'create',
            entity: 'student',
            entityId: student._id,
            entityName: `${student.firstName} ${student.lastName}`,
            changes: data,
            performedBy: await getCurrentUsername(),
        });

        revalidatePath('/dashboard/students');
        return { success: true, student: JSON.parse(JSON.stringify(student)) };
    } catch (error) {
        const err = error as Error;
        return { error: err.message || 'Failed to create Student' };
    }
}

// Electron-parity admission flow:
// - name is entered as a single field
// - roll number is unique per class + division within the selected academic year
// - admission date is required (Electron's `admission_date`)
export async function admitStudent(formData: FormData): Promise<ActionResult> {
    const name = ((formData.get('name') as string | null) || '').trim();
    const academicYearId = ((formData.get('academicYearId') as string | null) || '').trim();
    const branchId = ((formData.get('branchId') as string | null) || '').trim();
    const className = ((formData.get('class') as string | null) || '').trim();
    const shiftName = ((formData.get('shiftName') as string | null) || '').trim();
    const section = ((formData.get('section') as string | null) || '').trim(); // division in Electron
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

    if (!name || !academicYearId || !branchId || !className || !section || !rollNumber || !admissionDate || !gender) {
        return { error: 'Required fields missing' };
    }

    await dbConnect();

    const [year, feeStructure] = await Promise.all([
        AcademicYear.findById(academicYearId).lean(),
        FeeStructure.findOne({ academicYearId, branchId, class: className, shiftName }).lean(),
    ]);
    if (!year) return { error: 'Invalid Academic Year' };

    // Enforce roll uniqueness for parity (Electron checks within class + division).
    const existingRoll = await StudentEnrollment.findOne({
        academicYearId,
        class: className,
        shiftName,
        section,
        rollNumber: String(rollNumber),
    }).lean();
    if (existingRoll) {
        return { error: 'Roll number already exists in this class and division.' };
    }

    const nameParts = name.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || 'Unknown';
    const lastName = nameParts.slice(1).join(' ') || firstName;

    const admissionNumber = await generateAdmissionNumber({ branchId, academicYearId });

    const student = await Student.create({
        admissionNumber,
        firstName,
        lastName,
        admissionDate: new Date(admissionDate),
        joinedAt: new Date(admissionDate),
        gender,
        fatherName: fatherName || undefined,
        motherName: motherName || undefined,
        parentContact1: parentContact1 || undefined,
        parentContact2: parentContact2 || undefined,
        birthPlace: birthPlace || undefined,
        religion: religion || undefined,
        address: address || undefined,
        feeScholarship,
        branchId,
        isActive: true,
    });

    const enrollment = await StudentEnrollment.create({
        academicYearId,
        studentId: student._id,
        class: className,
        shiftName,
        section,
        rollNumber: String(rollNumber),
        status: 'Active',
        joinDate: new Date(admissionDate),
    });

    const baseFees: FeeAmounts = {
        term1: (feeStructure as { components?: { term1?: number } } | null)?.components?.term1 || 0,
        term2: (feeStructure as { components?: { term2?: number } } | null)?.components?.term2 || 0,
        bookFee: (feeStructure as { components?: { bookFee?: number } } | null)?.components?.bookFee || 0,
    };
    const adjusted = applyScholarshipToFeeAmounts(baseFees, feeScholarship);
    const fees = {
        term1: { amount: adjusted.term1, paid: 0, status: adjusted.term1 <= 0 ? 'Paid' : 'Pending' },
        term2: { amount: adjusted.term2, paid: 0, status: adjusted.term2 <= 0 ? 'Paid' : 'Pending' },
        bookFee: { amount: adjusted.bookFee, paid: 0, status: adjusted.bookFee <= 0 ? 'Paid' : 'Pending' },
    };

    await FeeRecord.create({
        academicYearId,
        studentId: student._id,
        enrollmentId: enrollment._id,
        branchId,
        fees,
        transactions: [],
    });

    await logAudit({
        action: 'create',
        entity: 'student',
        entityId: student._id,
        entityName: `${student.firstName} ${student.lastName}`,
        changes: {
            name,
            academicYearId,
            branchId,
            class: className,
            shiftName,
            section,
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

export async function getNextRollNumber({ academicYearId, className, shiftName = '', section }: NextRollNumberParams): Promise<{ next: number }> {
    if (!academicYearId || !className || !section) return { next: 1 };
    await dbConnect();

    const rows = await StudentEnrollment.find({
        academicYearId,
        class: className,
        shiftName,
        section,
    }).select('rollNumber').lean();

    let max = 0;
    for (const r of rows) {
        const n = parseInt(String((r as { rollNumber?: string }).rollNumber || '').trim(), 10);
        if (Number.isFinite(n) && n > max) max = n;
    }
    return { next: max + 1 };
}

export async function getStudentDirectory({ academicYearId, branchId = null, search = '' }: StudentDirectoryFilters = {}): Promise<StudentDirectoryRow[]> {
    if (!academicYearId) return [];
    await dbConnect();

    interface StudentMatch {
        isActive: boolean;
        branchId?: string;
    }
    const studentMatch: StudentMatch = { isActive: true };
    if (branchId) {
        studentMatch.branchId = branchId;
    }

    const enrollments = await StudentEnrollment.find({ academicYearId, status: 'Active' })
        .populate({
            path: 'studentId',
            match: studentMatch,
            select: 'firstName lastName admissionDate joinedAt gender fatherName motherName parentContact1 parentContact2 feeScholarship birthPlace religion address branchId',
        })
        .sort({ class: 1, section: 1, rollNumber: 1 })
        .lean();

    const q = String(search || '').trim().toLowerCase();

    interface PopulatedStudent {
        _id: Types.ObjectId;
        firstName?: string;
        lastName?: string;
        admissionDate?: Date;
        joinedAt?: Date;
        gender?: string;
        fatherName?: string;
        motherName?: string;
        parentContact1?: string;
        parentContact2?: string;
        feeScholarship?: number;
        birthPlace?: string;
        religion?: string;
        address?: string;
        branchId?: Types.ObjectId;
    }

    interface PopulatedEnrollment {
        _id: Types.ObjectId;
        studentId: PopulatedStudent | null;
        class?: string;
        section?: string;
        shiftName?: string;
        rollNumber?: string;
    }

    const filtered = (enrollments as unknown as PopulatedEnrollment[])
        .filter((e) => e.studentId)
        .map((e) => {
            const student = e.studentId!;
            const fullName = `${student.firstName || ''} ${student.lastName || ''}`.trim();
            return {
                _id: idToString(student._id) || '',
                enrollmentId: idToString(e._id) || '',
                academicYearId: idToString(academicYearId) || '',
                branchId: idToString(student.branchId),
                name: fullName,
                rollNumber: e.rollNumber || '',
                className: e.class || '',
                section: e.section || '',
                shiftName: e.shiftName || '',
                admissionDate: dateToISOString(student.admissionDate || student.joinedAt, { dateOnly: true }),
                gender: student.gender || '',
                fatherName: student.fatherName || '',
                motherName: student.motherName || '',
                parentContact1: student.parentContact1 || '',
                parentContact2: student.parentContact2 || '',
                feeScholarship: Number(student.feeScholarship) || 0,
                birthPlace: student.birthPlace || '',
                religion: student.religion || '',
                address: student.address || '',
            };
        })
        .filter((row) => {
            if (!q) return true;
            return (
                String(row.name).toLowerCase().includes(q) ||
                String(row.rollNumber).toLowerCase().includes(q) ||
                String(row.className).toLowerCase().includes(q) ||
                String(row.section).toLowerCase().includes(q) ||
                String(row.parentContact1).toLowerCase().includes(q)
            );
        });

    return filtered;
}

// Electron parity: teacher-wise student report (filters by teacher assignments).
export async function getStudentsByTeacher({
    teacherId,
    academicYearId,
    branchId,
    className = null,
    shiftName = null,
    section = null,
}: TeacherStudentFilters = {}): Promise<StudentDirectoryRow[]> {
    if (!teacherId || !academicYearId || !branchId) return [];
    await dbConnect();

    const teacher = await Staff.findById(teacherId).lean();
    if (!teacher || teacher.staffType !== 'teacher') return [];

    interface TeacherAssignment {
        classEntryId?: Types.ObjectId | string;
        branchId?: Types.ObjectId | string;
        className?: string;
        class_name?: string;
        shiftName?: string;
        shift_name?: string;
        division?: string;
    }

    const assignments: TeacherAssignment[] = Array.isArray(teacher.assignments) ? teacher.assignments : [];
    const classEntryIds = assignments
        .map((a) => idToString(a?.classEntryId))
        .filter(Boolean);

    interface ResolvedAssignment {
        className: string;
        shiftName: string;
        branchId: string | null;
    }

    const structuresById = new Map<string, ResolvedAssignment>();
    if (classEntryIds.length) {
        const structures = await FeeStructure.find({ _id: { $in: classEntryIds } })
            .select('class shiftName branchId')
            .lean();
        for (const s of structures || []) {
            const structure = s as { _id: Types.ObjectId; class?: string; shiftName?: string; branchId?: Types.ObjectId };
            structuresById.set(idToString(structure._id) || '', {
                className: structure.class || '',
                shiftName: structure.shiftName || '',
                branchId: idToString(structure.branchId),
            });
        }
    }

    interface ClassEntry {
        className: string;
        shiftName: string;
        allDivisions: boolean;
        divisions: Set<string>;
    }

    const byClassKey = new Map<string, ClassEntry>();
    for (const a of assignments) {
        const resolved: ResolvedAssignment = (() => {
            const id = idToString(a?.classEntryId);
            if (id && structuresById.has(id)) return structuresById.get(id)!;
            return {
                className: ((a?.className || a?.class_name || '') as string).trim(),
                shiftName: ((a?.shiftName || a?.shift_name || '') as string).trim(),
                branchId: idToString(a?.branchId),
            };
        })();

        // Electron parity: report is scoped to the active branch.
        // If an assignment has a branchId and it doesn't match, skip it.
        if (resolved.branchId && String(resolved.branchId) !== String(branchId)) continue;

        const cls = (resolved.className || '').trim();
        if (!cls) continue;
        const shift = (resolved.shiftName || '').trim();
        const key = `${cls}|||${shift}`;
        if (!byClassKey.has(key)) byClassKey.set(key, { className: cls, shiftName: shift, allDivisions: false, divisions: new Set() });
        const entry = byClassKey.get(key)!;
        const div = (a?.division || '').trim().toUpperCase();
        if (!div) entry.allDivisions = true;
        else entry.divisions.add(div);
    }

    // Restrict to requested class/shift if provided.
    let allowed = Array.from(byClassKey.values());
    if (className) {
        allowed = allowed.filter((x) => String(x.className) === String(className) && String(x.shiftName || '') === String(shiftName || ''));
    }

    const sectionFilter = (section || '').trim().toUpperCase();

    interface EnrollmentQueryClause {
        class: string;
        shiftName: string;
        section?: string | { $in: string[] };
    }

    const or: EnrollmentQueryClause[] = [];
    for (const a of allowed) {
        const clause: EnrollmentQueryClause = { class: a.className, shiftName: a.shiftName || '' };

        if (sectionFilter) {
            if (!a.allDivisions && a.divisions.size > 0 && !a.divisions.has(sectionFilter)) continue;
            clause.section = sectionFilter;
        } else if (!a.allDivisions && a.divisions.size > 0) {
            clause.section = { $in: Array.from(a.divisions) };
        }

        or.push(clause);
    }

    if (!or.length) return [];

    const enrollments = await StudentEnrollment.find({
        academicYearId,
        status: 'Active',
        $or: or,
    })
        .populate({
            path: 'studentId',
            match: {
                isActive: true,
                branchId,
            },
            select: 'firstName lastName admissionDate joinedAt parentContact1 parentContact2 gender feeScholarship birthPlace religion address branchId',
        })
        .sort({ class: 1, section: 1, rollNumber: 1 })
        .lean();

    interface PopulatedStudent {
        _id: Types.ObjectId;
        firstName?: string;
        lastName?: string;
        admissionDate?: Date;
        joinedAt?: Date;
        parentContact1?: string;
        parentContact2?: string;
        gender?: string;
        feeScholarship?: number;
        birthPlace?: string;
        religion?: string;
        address?: string;
        branchId?: Types.ObjectId;
    }

    interface PopulatedEnrollment {
        _id: Types.ObjectId;
        studentId: PopulatedStudent | null;
        class?: string;
        section?: string;
        shiftName?: string;
        rollNumber?: string;
    }

    return ((enrollments || []) as unknown as PopulatedEnrollment[])
        .filter((e) => e.studentId)
        .map((e) => {
            const student = e.studentId!;
            const fullName = `${student.firstName || ''} ${student.lastName || ''}`.trim();
            return {
                _id: idToString(student._id) || '',
                enrollmentId: idToString(e._id) || '',
                academicYearId: idToString(academicYearId) || '',
                branchId: idToString(student.branchId),
                name: fullName,
                rollNumber: e.rollNumber || '',
                className: e.class || '',
                section: e.section || '',
                shiftName: e.shiftName || '',
                admissionDate: dateToISOString(student.admissionDate || student.joinedAt, { dateOnly: true }),
                gender: student.gender || '',
                fatherName: '',
                motherName: '',
                parentContact1: student.parentContact1 || '',
                parentContact2: student.parentContact2 || '',
                feeScholarship: Number(student.feeScholarship) || 0,
                birthPlace: student.birthPlace || '',
                religion: student.religion || '',
                address: student.address || '',
            };
        });
}

export async function updateAdmittedStudent(studentId: string, formData: FormData): Promise<ActionResult> {
    await dbConnect();

    const name = ((formData.get('name') as string | null) || '').trim();
    const className = ((formData.get('class') as string | null) || '').trim();
    const shiftName = ((formData.get('shiftName') as string | null) || '').trim();
    const section = ((formData.get('section') as string | null) || '').trim();
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

    if (!studentId || !name || !className || !section || !rollNumber || !admissionDate || !gender) {
        return { error: 'Required fields missing' };
    }

    const student = await Student.findById(studentId);
    if (!student) return { error: 'Student not found' };

    const academicYearId = formData.get('academicYearId')?.toString?.() || '';
    if (!academicYearId) return { error: 'Academic year is required' };

    const enrollment = await StudentEnrollment.findOne({ academicYearId, studentId: student._id });
    if (!enrollment) return { error: 'Enrollment not found for this year' };

    // Enforce roll uniqueness within class + division (Electron parity)
    const existingRoll = await StudentEnrollment.findOne({
        academicYearId,
        class: className,
        shiftName,
        section,
        rollNumber: String(rollNumber),
        _id: { $ne: enrollment._id },
    }).lean();
    if (existingRoll) return { error: 'Roll number already exists in this class and division.' };

    const nameParts = name.split(/\s+/).filter(Boolean);
    student.firstName = nameParts[0] || student.firstName;
    student.lastName = nameParts.slice(1).join(' ') || student.firstName;
    student.admissionDate = new Date(admissionDate);
    student.joinedAt = new Date(admissionDate);
    student.gender = gender as 'Male' | 'Female' | 'Other';
    student.fatherName = fatherName || undefined;
    student.motherName = motherName || undefined;
    student.parentContact1 = parentContact1 || undefined;
    student.parentContact2 = parentContact2 || undefined;
    student.birthPlace = birthPlace || undefined;
    student.religion = religion || undefined;
    student.address = address || undefined;
    student.feeScholarship = feeScholarship;
    await student.save();

    enrollment.class = className;
    enrollment.shiftName = shiftName;
    enrollment.section = section;
    enrollment.rollNumber = String(rollNumber);
    await enrollment.save();

    // Keep dues consistent if class or scholarship changed.
    const feeRecord = await FeeRecord.findOne({ academicYearId, studentId: student._id });
    if (feeRecord) {
        const feeStructure = await FeeStructure.findOne({
            academicYearId,
            branchId: student.branchId,
            class: className,
            shiftName,
        }).lean();

        const base: FeeAmounts = {
            term1: feeStructure?.components?.term1 || 0,
            term2: feeStructure?.components?.term2 || 0,
            bookFee: feeStructure?.components?.bookFee || 0,
        };
        const adjusted = applyScholarshipToFeeAmounts(base, feeScholarship);

        feeRecord.fees.term1.amount = adjusted.term1;
        feeRecord.fees.term2.amount = adjusted.term2;
        feeRecord.fees.bookFee.amount = adjusted.bookFee;

        const heads: FeeHeadKey[] = ['term1', 'term2', 'bookFee'];
        for (const head of heads) {
            const amount = Number(feeRecord.fees?.[head]?.amount) || 0;
            const paid = Number(feeRecord.fees?.[head]?.paid) || 0;
            feeRecord.fees[head].status = amount <= 0 ? 'Paid' : paid >= amount ? 'Paid' : paid > 0 ? 'Partial' : 'Pending';
        }

        await feeRecord.save();
    }

    await logAudit({
        action: 'update',
        entity: 'student',
        entityId: student._id,
        entityName: `${student.firstName} ${student.lastName}`,
        changes: { name, class: className, shiftName, section, rollNumber, admissionDate, gender, feeScholarship },
        performedBy: await getCurrentUsername(),
    });

    revalidatePath('/dashboard/students');
    revalidatePath('/dashboard/fees');
    revalidatePath('/dashboard/enrollment');
    return { success: true };
}

export async function getStudents(filters: StudentFilters = {}): Promise<PaginatedStudentsResult> {
    await dbConnect();

    interface StudentQuery {
        isActive: boolean;
        branchId?: string;
        $or?: Array<{ [key: string]: { $regex: string; $options: string } }>;
    }

    const query: StudentQuery = { isActive: true };
    const page = filters.page || 1;
    const limit = filters.limit || 25;
    const skip = (page - 1) * limit;

    if (filters.branchId) {
        query.branchId = filters.branchId;
    }

    if (filters.search) {
        query.$or = [
            { firstName: { $regex: filters.search, $options: 'i' } },
            { lastName: { $regex: filters.search, $options: 'i' } },
            { admissionNumber: { $regex: filters.search, $options: 'i' } },
        ];
    }

    const [students, total] = await Promise.all([
        Student.find(query as FilterQuery<IStudentDocument>)
            .populate('branchId', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Student.countDocuments(query as FilterQuery<IStudentDocument>)
    ]);

    interface PopulatedBranch {
        _id: Types.ObjectId;
        name?: string;
    }

    interface StudentWithBranch {
        _id: Types.ObjectId;
        admissionNumber?: string;
        firstName?: string;
        lastName?: string;
        branchId?: PopulatedBranch | Types.ObjectId;
        dob?: Date;
        admissionDate?: Date;
        joinedAt?: Date;
        feeScholarship?: number;
        isActive?: boolean;
        createdAt?: Date;
        updatedAt?: Date;
    }

    const data: SerializedStudentBasic[] = (students as unknown as StudentWithBranch[]).map(s => ({
        _id: idToString(s._id) || '',
        admissionNumber: s.admissionNumber || '',
        firstName: s.firstName || '',
        lastName: s.lastName || '',
        fullName: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
        branchId: idToString(s.branchId),
        branchName: pickRefName(s.branchId as PopulatedBranch),
        // `admissionDate` is the primary date in this app (Electron parity).
        admissionDate: dateToISOString(s.admissionDate || s.joinedAt || s.dob, { dateOnly: true }),
        // Keep legacy fields for safety; prefer `admissionDate` in UI.
        dob: dateToISOString(s.dob, { dateOnly: true }),
        joinedAt: dateToISOString(s.joinedAt, { dateOnly: true }),
        feeScholarship: Number(s.feeScholarship) || 0,
        isActive: !!s.isActive,
        createdAt: dateToISOString(s.createdAt),
        updatedAt: dateToISOString(s.updatedAt),
    }));

    return {
        data,
        total,
        page,
        totalPages: Math.ceil(total / limit)
    };
}

interface SerializedStudentDetail extends SerializedStudentBasic {
    branchName?: string | null;
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

    const student = await Student.findById(id)
        .populate('branchId', 'name')
        .lean();

    if (!student) {
        return null;
    }

    interface PopulatedBranch {
        _id: Types.ObjectId;
        name?: string;
    }

    const s = student as unknown as {
        _id: Types.ObjectId;
        admissionNumber?: string;
        firstName?: string;
        lastName?: string;
        branchId?: PopulatedBranch | Types.ObjectId;
        dob?: Date;
        admissionDate?: Date;
        joinedAt?: Date;
        feeScholarship?: number;
        isActive?: boolean;
        gender?: string;
        birthPlace?: string;
        religion?: string;
        address?: string;
        fatherName?: string;
        motherName?: string;
        parentContact1?: string;
        parentContact2?: string;
        createdAt?: Date;
        updatedAt?: Date;
    };

    return {
        _id: idToString(s._id) || '',
        admissionNumber: s.admissionNumber || '',
        firstName: s.firstName || '',
        lastName: s.lastName || '',
        fullName: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
        branchId: idToString(s.branchId),
        branchName: pickRefName(s.branchId as PopulatedBranch),
        admissionDate: dateToISOString(s.admissionDate || s.joinedAt || s.dob, { dateOnly: true }),
        dob: dateToISOString(s.dob, { dateOnly: true }),
        joinedAt: dateToISOString(s.joinedAt, { dateOnly: true }),
        feeScholarship: Number(s.feeScholarship) || 0,
        isActive: !!s.isActive,
        gender: s.gender,
        birthPlace: s.birthPlace,
        religion: s.religion,
        address: s.address,
        fatherName: s.fatherName,
        motherName: s.motherName,
        parentContact1: s.parentContact1,
        parentContact2: s.parentContact2,
        createdAt: dateToISOString(s.createdAt),
        updatedAt: dateToISOString(s.updatedAt),
    };
}

export async function updateStudent(id: string, formData: FormData): Promise<ActionResult<IStudentDocument>> {
    await dbConnect();

    const data: Record<string, string | number | Date | undefined> = {};
    const fields = [
        'firstName', 'lastName', 'admissionDate', 'dob', 'gender', 'birthPlace', 'religion',
        'address', 'fatherName', 'motherName', 'parentContact1', 'parentContact2',
        'branchId', 'feeScholarship'
    ];

    fields.forEach(field => {
        const value = formData.get(field) as string | null;
        if (value !== null && value !== '' && value !== undefined) {
            if (field === 'feeScholarship') {
                data[field] = parseFloat(value) || 0;
            } else if (field === 'admissionDate') {
                data[field] = new Date(value);
            } else if (field === 'dob') {
                data[field] = new Date(value);
            } else {
                data[field] = value;
            }
        }
    });

    try {
        const oldStudent = await Student.findById(id).lean() as Record<string, unknown> | null;
        const student = await Student.findByIdAndUpdate(id, data, { new: true });
        if (!student) {
            return { error: 'Student not found' };
        }

        // Keep fee dues consistent with scholarship changes (Electron parity: scholarship reduces pending fees).
        if (Object.prototype.hasOwnProperty.call(data, 'feeScholarship')) {
            await recomputeStudentFeeDuesForScholarship(student._id, data.feeScholarship as number);
        }

        await logAudit({
            action: 'update',
            entity: 'student',
            entityId: student._id,
            entityName: `${student.firstName} ${student.lastName}`,
            changes: Object.keys(data).reduce((acc, key) => {
                if (oldStudent && oldStudent[key] !== data[key]) {
                    acc[key] = { old: oldStudent[key], new: data[key] };
                }
                return acc;
            }, {} as Record<string, { old: unknown; new: unknown }>),
            performedBy: await getCurrentUsername(),
        });

        revalidatePath('/dashboard/students');
        return { success: true, student: JSON.parse(JSON.stringify(student)) };
    } catch (error) {
        const err = error as Error;
        return { error: err.message || 'Failed to update Student' };
    }
}

export async function deleteStudent(id: string): Promise<ActionResult> {
    await dbConnect();

    try {
        const student = await Student.findByIdAndUpdate(id, { isActive: false }, { new: true });
        if (!student) {
            return { error: 'Student not found' };
        }

        await logAudit({
            action: 'delete',
            entity: 'student',
            entityId: student._id,
            entityName: `${student.firstName} ${student.lastName}`,
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

    interface SearchQuery {
        isActive: boolean;
        $or: Array<{ [key: string]: { $regex: string; $options: string } }>;
        branchId?: string;
    }

    const searchQuery: SearchQuery = {
        isActive: true,
        $or: [
            { firstName: { $regex: query, $options: 'i' } },
            { lastName: { $regex: query, $options: 'i' } },
            { admissionNumber: { $regex: query, $options: 'i' } },
        ]
    };

    if (branchId) {
        searchQuery.branchId = branchId;
    }

    const students = await Student.find(searchQuery as FilterQuery<IStudentDocument>)
        .limit(limit)
        .lean();

    interface StudentLean {
        _id: Types.ObjectId;
        admissionNumber?: string;
        firstName?: string;
        lastName?: string;
        branchId?: Types.ObjectId;
        dob?: Date;
        admissionDate?: Date;
        joinedAt?: Date;
        feeScholarship?: number;
        isActive?: boolean;
        createdAt?: Date;
        updatedAt?: Date;
    }

    return (students as unknown as StudentLean[]).map(s => ({
        _id: idToString(s._id) || '',
        admissionNumber: s.admissionNumber || '',
        firstName: s.firstName || '',
        lastName: s.lastName || '',
        fullName: `${s.firstName} ${s.lastName}`.trim(),
        branchId: idToString(s.branchId),
        dob: dateToISOString(s.dob, { dateOnly: true }),
        admissionDate: dateToISOString(s.admissionDate, { dateOnly: true }),
        joinedAt: dateToISOString(s.joinedAt),
        feeScholarship: Number(s.feeScholarship) || 0,
        isActive: !!s.isActive,
        createdAt: dateToISOString(s.createdAt),
        updatedAt: dateToISOString(s.updatedAt),
    }));
}

export async function getStudentCount(branchId: string | null = null): Promise<number> {
    await dbConnect();

    interface CountQuery {
        isActive: boolean;
        branchId?: string;
    }

    const query: CountQuery = { isActive: true };
    if (branchId) {
        query.branchId = branchId;
    }

    return await Student.countDocuments(query as FilterQuery<IStudentDocument>);
}
