import { toCsv } from '@/lib/csv';
import { getAcademicYearsPage } from '@/app/actions/academicYear';
import { getBranchesPage } from '@/app/actions/branch';
import { getEnrollmentsPage } from '@/app/actions/enrollment';
import { getFeePaymentsPage } from '@/app/actions/feeRecord';
import { getFeeStructuresPage } from '@/app/actions/feeStructure';
import { getStaffPage } from '@/app/actions/staff';
import { getStudentDirectoryPage } from '@/app/actions/student';
import { getTransportsPage } from '@/app/actions/transport';
import { getAuditLogsPage } from '@/app/actions/audit';
import { auditFormatChangesInline } from '@/lib/auditFormat';

const PAGE_SIZE = 200;
const MAX_EXPORT_ROWS = 100_000;

type ExportBody = {
    academicYearId?: string;
    branchId?: string | null;
    includeInactive?: boolean;
    search?: string;
    sortModel?: unknown;
    filterModel?: unknown;
    filename?: string;
};

function safeFilename(base: unknown, fallback: string): string {
    const raw = String(base || '').trim() || fallback;
    const cleaned = raw.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return cleaned || fallback;
}

async function collectAll<T>(fetchPage: (page: number) => Promise<{ rows: T[]; total: number }>): Promise<{ rows: T[]; total: number }> {
    let page = 0;
    let total = 0;
    const all: T[] = [];

    while (true) {
        const res = await fetchPage(page);
        if (page === 0) total = Number(res.total) || 0;
        if (Array.isArray(res.rows) && res.rows.length) {
            all.push(...res.rows);
        }
        if (all.length >= total) break;
        if (res.rows.length === 0) break;
        if (all.length >= MAX_EXPORT_ROWS) break;
        page += 1;
    }

    return { rows: all, total };
}

export async function POST(request: Request, { params }: { params: Promise<{ entity: string }> }) {
    const { entity } = await params;
    const body = (await request.json().catch(() => ({}))) as ExportBody;
    const search = String(body.search || '').trim();
    const sortModel = body.sortModel;
    const filterModel = body.filterModel;

    const branchId = body.branchId ?? null;
    const academicYearId = body.academicYearId ?? '';

    // Normalize entity names for URL usage.
    const key = String(entity || '').trim().toLowerCase();

    if (key === 'students') {
        const data = await collectAll(async (page) => getStudentDirectoryPage({
            academicYearId,
            branchId,
            search,
            page,
            pageSize: PAGE_SIZE,
            sortModel,
            filterModel,
        }));
        if (data.total > MAX_EXPORT_ROWS) {
            return Response.json({ error: `Too many rows to export (${data.total}). Please add search/filters and try again.` }, { status: 413 });
        }

        const headers = ['Admission No', 'Student Name', 'Roll No', 'Class', 'Section', 'Shift', 'Gender', "Father's Contact", "Mother's Contact", 'Admission Date'];
        const rows = data.rows.map((r) => ([
            r.admissionNumber || '',
            r.name || '',
            r.rollNumber || '',
            r.className || '',
            r.section || '',
            r.shiftName || '',
            r.gender || '',
            r.parentContact1 || '',
            r.parentContact2 || '',
            r.admissionDate || '',
        ]));

        const csv = toCsv(headers, rows);
        const filename = safeFilename(body.filename, `students-${Date.now()}`) + '.csv';
        return new Response(csv, {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    }

    if (key === 'staff') {
        const data = await collectAll(async (page) => getStaffPage({
            page,
            pageSize: PAGE_SIZE,
            search,
            sortModel,
            filterModel,
        }));
        if (data.total > MAX_EXPORT_ROWS) {
            return Response.json({ error: `Too many rows to export (${data.total}). Please add search/filters and try again.` }, { status: 413 });
        }

        const headers = ['Name', 'Type', 'Role', 'Contact', 'Email', 'Branch'];
        const rows = data.rows.map((r) => ([
            r.name || '',
            r.staffType || '',
            r.role || '',
            r.contact || '',
            r.email || '',
            r.branchName || '',
        ]));
        const csv = toCsv(headers, rows);
        const filename = safeFilename(body.filename, `staff-${Date.now()}`) + '.csv';
        return new Response(csv, {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    }

    if (key === 'classes') {
        const data = await collectAll(async (page) => getFeeStructuresPage(
            academicYearId,
            branchId,
            search,
            page,
            PAGE_SIZE,
            sortModel,
            filterModel
        ));
        if (data.total > MAX_EXPORT_ROWS) {
            return Response.json({ error: `Too many rows to export (${data.total}). Please add search/filters and try again.` }, { status: 413 });
        }

        const headers = ['Class', 'Shift', 'Start Time', 'End Time', 'Divisions', 'Term 1 Fee', 'Term 2 Fee', 'Book Fee'];
        const rows = data.rows.map((r) => ([
            r.class || '',
            r.shiftName || '',
            r.startTime || '',
            r.endTime || '',
            r.numDivisions ?? '',
            r.components?.term1 ?? '',
            r.components?.term2 ?? '',
            r.components?.bookFee ?? '',
        ]));
        const csv = toCsv(headers, rows);
        const filename = safeFilename(body.filename, `classes-${Date.now()}`) + '.csv';
        return new Response(csv, {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    }

    if (key === 'transport') {
        const data = await collectAll(async (page) => getTransportsPage({
            page,
            pageSize: PAGE_SIZE,
            search,
            sortModel,
            filterModel,
        }));
        if (data.total > MAX_EXPORT_ROWS) {
            return Response.json({ error: `Too many rows to export (${data.total}). Please add search/filters and try again.` }, { status: 413 });
        }

        const headers = ['Route', 'Vehicle Type', 'Vehicle Number', 'Capacity', 'Driver Name', 'Driver Contact', 'Branch'];
        const rows = data.rows.map((r) => ([
            r.route || '',
            r.vehicleType || '',
            r.vehicleNumber || '',
            r.capacity ?? '',
            r.driverName || '',
            r.driverContact || '',
            r.branchName || '',
        ]));
        const csv = toCsv(headers, rows);
        const filename = safeFilename(body.filename, `transport-${Date.now()}`) + '.csv';
        return new Response(csv, {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    }

    if (key === 'fees') {
        const data = await collectAll(async (page) => getFeePaymentsPage({
            academicYearId,
            branchId,
            search,
            page,
            pageSize: PAGE_SIZE,
            sortModel,
            filterModel,
        }));
        if (data.total > MAX_EXPORT_ROWS) {
            return Response.json({ error: `Too many rows to export (${data.total}). Please add search/filters and try again.` }, { status: 413 });
        }

        const headers = [
            'Receipt No',
            'Student Name',
            'Roll No',
            'Class',
            'Section',
            'Shift',
            'Amount',
            'Payment Type',
            'Payee Name',
            'Bank Name',
            'Cheque No',
            'UPI ID',
            'UPI Ref',
            'Payment Date',
            'Month/Year',
            'Fee Term',
            'Notes',
        ];
        const rows = data.rows.map((r) => ([
            r.receiptNumber || '',
            r.studentName || '',
            r.rollNumber || '',
            r.className || '',
            r.section || '',
            r.shiftName || '',
            r.amount ?? '',
            r.paymentType || '',
            r.payeeName || '',
            r.bankName || '',
            r.chequeNumber || '',
            r.upiId || '',
            r.upiReference || '',
            r.paymentDate || '',
            r.monthYear || '',
            r.feeTerm || '',
            r.notes || '',
        ]));
        const csv = toCsv(headers, rows);
        const filename = safeFilename(body.filename, `fees-${Date.now()}`) + '.csv';
        return new Response(csv, {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    }

    if (key === 'enrollment') {
        const data = await collectAll(async (page) => getEnrollmentsPage({
            academicYearId,
            branchId,
            search,
            page,
            pageSize: PAGE_SIZE,
            sortModel,
            filterModel,
        }));
        if (data.total > MAX_EXPORT_ROWS) {
            return Response.json({ error: `Too many rows to export (${data.total}). Please add search/filters and try again.` }, { status: 413 });
        }

        const headers = ['Admission No', 'Student Name', 'Class', 'Section', 'Roll No', 'Shift', 'Status', 'Join Date'];
        const rows = data.rows.map((r) => ([
            r.studentId?.admissionNumber || '',
            `${r.studentId?.firstName || ''} ${r.studentId?.lastName || ''}`.trim(),
            r.class || '',
            r.section || '',
            r.rollNumber || '',
            r.shiftName || '',
            r.status || '',
            r.joinDate || '',
        ]));
        const csv = toCsv(headers, rows);
        const filename = safeFilename(body.filename, `enrollment-${Date.now()}`) + '.csv';
        return new Response(csv, {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    }

    if (key === 'branches') {
        const data = await collectAll(async (page) => getBranchesPage({
            includeInactive: Boolean(body.includeInactive),
            search,
            page,
            pageSize: PAGE_SIZE,
            sortModel,
            filterModel,
        }));
        if (data.total > MAX_EXPORT_ROWS) {
            return Response.json({ error: `Too many rows to export (${data.total}). Please add search/filters and try again.` }, { status: 413 });
        }

        const headers = ['Name', 'Code', 'Contact', 'Email', 'Address', 'Active'];
        const rows = data.rows.map((r) => ([
            r.name || '',
            r.code || '',
            r.contact || '',
            r.email || '',
            r.address || '',
            r.isActive ? 'Yes' : 'No',
        ]));
        const csv = toCsv(headers, rows);
        const filename = safeFilename(body.filename, `branches-${Date.now()}`) + '.csv';
        return new Response(csv, {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    }

    if (key === 'academic-years') {
        const data = await collectAll(async (page) => getAcademicYearsPage({
            search,
            page,
            pageSize: PAGE_SIZE,
            sortModel,
            filterModel,
        }));
        if (data.total > MAX_EXPORT_ROWS) {
            return Response.json({ error: `Too many rows to export (${data.total}). Please add search/filters and try again.` }, { status: 413 });
        }

        const headers = ['Name', 'Start Date', 'End Date', 'Active', 'Locked'];
        const rows = data.rows.map((r) => ([
            r.name || '',
            r.startDate || '',
            r.endDate || '',
            r.isActive ? 'Yes' : 'No',
            r.isLocked ? 'Yes' : 'No',
        ]));
        const csv = toCsv(headers, rows);
        const filename = safeFilename(body.filename, `academic-years-${Date.now()}`) + '.csv';
        return new Response(csv, {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    }

    if (key === 'audit') {
        const data = await collectAll(async (page) => getAuditLogsPage({
            search,
            page,
            pageSize: PAGE_SIZE,
            sortModel,
            filterModel,
        }));
        if (data.total > MAX_EXPORT_ROWS) {
            return Response.json({ error: `Too many rows to export (${data.total}). Please add search/filters and try again.` }, { status: 413 });
        }

        const headers = ['Timestamp', 'Action', 'Entity', 'Entity Name', 'Performed By', 'Changes'];
        const rows = data.rows.map((r) => ([
            r.timestamp || '',
            r.action || '',
            r.entity || '',
            r.entityName || '',
            r.performedBy || '',
            auditFormatChangesInline(r.changes, { maxFields: 50 }),
        ]));
        const csv = toCsv(headers, rows);
        const filename = safeFilename(body.filename, `audit-log-${Date.now()}`) + '.csv';
        return new Response(csv, {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    }

    return Response.json({ error: `Unknown export entity: ${key}` }, { status: 404 });
}
