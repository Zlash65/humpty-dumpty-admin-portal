import { getPrisma } from './prisma';

/**
 * Provider-agnostic SQL tagged template powered by Prisma `$queryRaw`.
 *
 * This is intentionally shaped to match the existing `sql` usage across the app:
 *   await sql<Array<Row>>`SELECT ...`
 *   await sql`INSERT ...`
 *   await sql.transaction([ sql`...`, sql`...` ])
 *
 * Keeping this wrapper means we can use any Postgres provider (RDS/Supabase/local/etc.)
 * without rewriting the whole app to an ORM right away.
 */

export type SqlTag = (<T = any>(
    strings: TemplateStringsArray,
    ...values: any[]
) => any) & {
    transaction: (queries: any[], options?: { maxWait?: number; timeout?: number; isolationLevel?: any }) => Promise<any>;
};

let cachedSql: SqlTag | null = null;

function requireSql(): SqlTag {
    if (cachedSql) return cachedSql;

    const prisma = getPrisma();

    const tag = (<T = any>(strings: TemplateStringsArray, ...values: any[]) => {
        // Prisma `$queryRaw` is itself a tag, but calling it as a regular function
        // with the template parts is equivalent to using it with backticks.
        return (prisma.$queryRaw as any)(strings, ...values) as Promise<T>;
    }) as SqlTag;

    tag.transaction = async (queries: any[], options?: { maxWait?: number; timeout?: number; isolationLevel?: any }) => {
        const client = getPrisma();
        // Prisma expects an array of PrismaPromises (which `$queryRaw` returns).
        return client.$transaction(queries as any, options as any);
    };

    cachedSql = tag;
    return tag;
}

export const sql: SqlTag = Object.assign(
    (<T = any>(strings: TemplateStringsArray, ...values: any[]) => requireSql()<T>(strings, ...values)) as SqlTag,
    {
        transaction: (queries: any[], options?: { maxWait?: number; timeout?: number; isolationLevel?: any }) =>
            requireSql().transaction(queries, options),
    }
);
