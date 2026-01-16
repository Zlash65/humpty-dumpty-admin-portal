import type { PrismaSql } from '@/lib/prismaSql';
import { empty, join, psql } from '@/lib/prismaSql';
import { normalizeLooseSearch, splitSearchTokens } from '@/lib/search';

function normalizedExpr(expr: PrismaSql): PrismaSql {
    return psql`regexp_replace(lower(COALESCE(${expr}::text,'')), '[^a-z0-9]+', '', 'g')`;
}

export function buildLooseSearchWhereSql({
    query,
    fields,
    maxTokens = 5,
}: {
    query: string | null | undefined;
    fields: PrismaSql[];
    maxTokens?: number;
}): PrismaSql {
    const q = String(query || '').trim();
    if (!q) return empty;

    const tokens = splitSearchTokens(q, maxTokens);
    if (!tokens.length) return empty;

    const tokenGroups: PrismaSql[] = [];

    for (const tokenRaw of tokens) {
        const token = String(tokenRaw || '').trim();
        if (!token) continue;

        const tokenNorm = normalizeLooseSearch(token);
        const orClauses: PrismaSql[] = [];

        for (const fieldExpr of fields) {
            orClauses.push(psql`${fieldExpr} ILIKE ${`%${token}%`}`);
            if (tokenNorm) {
                orClauses.push(psql`${normalizedExpr(fieldExpr)} LIKE ${`%${tokenNorm}%`}`);
            }
        }

        if (orClauses.length) {
            tokenGroups.push(psql`(${join(orClauses, ' OR ')})`);
        }
    }

    if (!tokenGroups.length) return empty;

    return psql` AND (${join(tokenGroups, ' AND ')})`;
}
