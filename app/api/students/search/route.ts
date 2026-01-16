import { NextResponse, type NextRequest } from 'next/server';
import dbConnect from '@/lib/db';
import { sql } from '@/lib/sql';
import { psql } from '@/lib/prismaSql';
import { requireApiAuth } from '@/lib/authGuards';
import { buildLooseSearchWhereSql } from '@/lib/searchSql';

type Option = { value: string; label: string; keywords?: string };

export async function GET(request: NextRequest) {
    const auth = requireApiAuth(request);
    if (auth.ok === false) return auth.response;

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

    const searchWhere = buildLooseSearchWhereSql({
        query: q,
        fields: [
            psql`COALESCE(s.first_name,'')`,
            psql`COALESCE(s.last_name,'')`,
            psql`(COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,''))`,
            psql`COALESCE(s.admission_number,'')`,
        ],
    });

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
          ${searchWhere}
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
