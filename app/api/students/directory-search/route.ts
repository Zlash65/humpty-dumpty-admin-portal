import { NextResponse, type NextRequest } from 'next/server';
import dbConnect from '@/lib/db';
import { sql } from '@/lib/sql';
import { requireApiAuth } from '@/lib/authGuards';

type Option = { value: string; label: string; keywords?: string };

export async function GET(request: NextRequest) {
    const auth = requireApiAuth(request);
    if (auth.ok === false) return auth.response;

    await dbConnect();

    const url = new URL(request.url);
    const academicYearId = url.searchParams.get('academicYearId') || '';
    const branchId = url.searchParams.get('branchId') || null;
    const q = (url.searchParams.get('q') || '').trim();
    const limitRaw = Number(url.searchParams.get('limit') || 30);
    const limit = Math.max(5, Math.min(50, Number.isFinite(limitRaw) ? limitRaw : 30));

    if (!academicYearId) {
        return NextResponse.json({ options: [] satisfies Option[] }, { status: 400 });
    }

    if (!q || q.length < 2) {
        return NextResponse.json({ options: [] satisfies Option[] });
    }

    const rows = await sql<Array<{
        student_id: string;
        first_name: string;
        last_name: string;
        admission_number: string | null;
        roll_number: string | null;
        class: string;
        division: string;
        shift_name: string;
    }>>`
        SELECT
            s.id AS student_id,
            s.first_name,
            s.last_name,
            s.admission_number,
            e.roll_number,
            e.class,
            e.division,
            e.shift_name
        FROM student_enrollments e
        JOIN students s ON s.id = e.student_id
        WHERE e.academic_year_id = ${academicYearId}::uuid
          AND e.status = 'Active'
          AND s.is_active = true
          AND (${branchId}::uuid IS NULL OR s.branch_id = ${branchId}::uuid)
          AND (
              (s.first_name || ' ' || s.last_name) ILIKE ('%' || ${q} || '%') OR
              s.first_name ILIKE ('%' || ${q} || '%') OR
              s.last_name ILIKE ('%' || ${q} || '%') OR
              COALESCE(s.admission_number,'') ILIKE ('%' || ${q} || '%') OR
              COALESCE(e.roll_number,'') ILIKE ('%' || ${q} || '%') OR
              e.class ILIKE ('%' || ${q} || '%') OR
              e.division ILIKE ('%' || ${q} || '%')
          )
        ORDER BY e.class ASC, e.division ASC, e.roll_number ASC NULLS LAST
        LIMIT ${limit}
    `;

    const options: Option[] = rows.map((r) => {
        const fullName = `${r.first_name || ''} ${r.last_name || ''}`.trim();
        const roll = r.roll_number ? ` (${r.roll_number})` : '';
        const division = r.division ? `-${r.division}` : '';
        const classLabel = r.class ? ` (${r.class}${division})` : '';
        const label = `${fullName}${roll}${classLabel}`.trim();
        const keywords = [fullName, r.admission_number, r.roll_number, r.class, r.division, r.shift_name].filter(Boolean).join(' ');
        return { value: r.student_id, label, keywords };
    });

    return NextResponse.json({ options });
}
