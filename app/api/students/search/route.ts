import { NextResponse, type NextRequest } from 'next/server';
import dbConnect from '@/lib/db';
import { sql } from '@/lib/sql';

type Option = { value: string; label: string; keywords?: string };

export async function GET(request: NextRequest) {
    await dbConnect();

    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim();
    const branchId = url.searchParams.get('branchId') || null;
    const excludeAcademicYearId = url.searchParams.get('excludeAcademicYearId') || null;
    const limitRaw = Number(url.searchParams.get('limit') || 30);
    const limit = Math.max(5, Math.min(50, Number.isFinite(limitRaw) ? limitRaw : 30));

    if (!q || q.length < 2) {
        return NextResponse.json({ options: [] satisfies Option[] });
    }

    const rows = await sql<Array<{
        id: string;
        first_name: string;
        last_name: string;
        admission_number: string | null;
    }>>`
        SELECT s.id, s.first_name, s.last_name, s.admission_number
        FROM students s
        WHERE s.is_active = true
          AND (${branchId}::uuid IS NULL OR s.branch_id = ${branchId}::uuid)
          AND (
              s.first_name ILIKE ('%' || ${q} || '%') OR
              s.last_name ILIKE ('%' || ${q} || '%') OR
              COALESCE(s.admission_number,'') ILIKE ('%' || ${q} || '%') OR
              (s.first_name || ' ' || s.last_name) ILIKE ('%' || ${q} || '%')
          )
          AND (
              ${excludeAcademicYearId}::uuid IS NULL OR
              NOT EXISTS (
                  SELECT 1
                  FROM student_enrollments e
                  WHERE e.student_id = s.id
                    AND e.academic_year_id = ${excludeAcademicYearId}::uuid
              )
          )
        ORDER BY s.first_name ASC, s.last_name ASC
        LIMIT ${limit}
    `;

    const options: Option[] = rows.map((r) => {
        const fullName = `${r.first_name || ''} ${r.last_name || ''}`.trim();
        const admission = r.admission_number ? ` (${r.admission_number})` : '';
        const label = `${fullName}${admission}`.trim();
        return {
            value: r.id,
            label,
            keywords: [fullName, r.admission_number].filter(Boolean).join(' '),
        };
    });

    return NextResponse.json({ options });
}

