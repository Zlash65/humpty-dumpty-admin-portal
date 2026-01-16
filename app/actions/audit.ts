'use server';

import dbConnect from '@/lib/db';
import { dateToISOString } from '@/lib/serialize';
import { psql, querySql } from '@/lib/prismaSql';
import { buildFilterWhereSql, normalizeSortModel } from '@/lib/gridServer';
import { buildLooseSearchWhereSql } from '@/lib/searchSql';

export interface AuditLogRow {
    _id: string;
    action: string;
    entity: string;
    entityId?: string;
    entityName?: string;
    changes: unknown;
    performedBy: string;
    ipAddress?: string;
    userAgent?: string;
    timestamp?: string;
    createdAt?: string;
}

interface AuditLogsPageParams {
    search?: string;
    page?: number; // 0-indexed
    pageSize?: number;
    sortModel?: unknown;
    filterModel?: unknown;
}

export async function getAuditLogsPage({
    search = '',
    page = 0,
    pageSize = 25,
    sortModel,
    filterModel,
}: AuditLogsPageParams = {}): Promise<{ rows: AuditLogRow[]; total: number }> {
    await dbConnect();

    const safePage = Number.isFinite(Number(page)) ? Math.max(0, Number(page)) : 0;
    const safePageSize = Number.isFinite(Number(pageSize)) ? Math.min(200, Math.max(5, Number(pageSize))) : 25;
    const offset = safePage * safePageSize;

    const searchWhere = buildLooseSearchWhereSql({
        query: search,
        fields: [
            psql`COALESCE(entity_name,'')`,
            psql`COALESCE(performed_by,'')`,
            psql`COALESCE(action,'')`,
            psql`COALESCE(entity,'')`,
            psql`COALESCE(entity_id,'')`,
            psql`COALESCE(ip_address,'')`,
            psql`COALESCE(user_agent,'')`,
            psql`COALESCE(timestamp::text,'')`,
        ],
    });

    const filterWhere = buildFilterWhereSql(filterModel, {
        action: { expr: psql`COALESCE(action,'')` },
        entity: { expr: psql`COALESCE(entity,'')` },
        entityName: { expr: psql`COALESCE(entity_name,'')` },
        performedBy: { expr: psql`COALESCE(performed_by,'')` },
    });

    const sort = normalizeSortModel(sortModel);
    const orderBy = (() => {
        const dir = sort?.direction === 'asc' ? psql`ASC` : psql`DESC`;
        if (sort?.field === 'timestamp') return psql`ORDER BY timestamp ${dir}`;
        if (sort?.field === 'action') return psql`ORDER BY action ${dir}, timestamp DESC`;
        if (sort?.field === 'entity') return psql`ORDER BY entity ${dir}, timestamp DESC`;
        if (sort?.field === 'entityName') return psql`ORDER BY entity_name ${dir} NULLS LAST, timestamp DESC`;
        if (sort?.field === 'performedBy') return psql`ORDER BY performed_by ${dir}, timestamp DESC`;
        return psql`ORDER BY timestamp DESC`;
    })();

    const countRows = await querySql<Array<{ total: number }>>(psql`
        SELECT COUNT(*)::int AS total
        FROM audit_logs
        WHERE 1=1
        ${searchWhere}
        ${filterWhere}
    `);
    const total = countRows?.[0]?.total || 0;

    const rows = await querySql<Array<{
        id: string;
        action: string;
        entity: string;
        entity_id: string | null;
        entity_name: string | null;
        changes: unknown;
        performed_by: string;
        ip_address: string | null;
        user_agent: string | null;
        timestamp: string;
        created_at: string;
    }>>(psql`
        SELECT
            id,
            action,
            entity,
            entity_id,
            entity_name,
            changes,
            performed_by,
            ip_address,
            user_agent,
            timestamp,
            created_at
        FROM audit_logs
        WHERE 1=1
        ${searchWhere}
        ${filterWhere}
        ${orderBy}
        LIMIT ${safePageSize}
        OFFSET ${offset}
    `);

    return {
        rows: (rows || []).map((r) => ({
            _id: r.id,
            action: r.action,
            entity: r.entity,
            entityId: r.entity_id || undefined,
            entityName: r.entity_name || undefined,
            changes: r.changes ?? {},
            performedBy: r.performed_by || 'system',
            ipAddress: r.ip_address || undefined,
            userAgent: r.user_agent || undefined,
            timestamp: dateToISOString(r.timestamp),
            createdAt: dateToISOString(r.created_at),
        })),
        total,
    };
}
