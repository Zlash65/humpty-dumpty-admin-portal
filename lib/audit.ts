import dbConnect from './db';
import type { AuditAction, AuditEntity, IAuditLogChanges } from '@/types';
import { sql } from '@/lib/sql';

export interface LogAuditParams {
    action: AuditAction;
    entity: AuditEntity;
    entityId?: string;
    entityName?: string;
    changes?: IAuditLogChanges | Record<string, unknown>;
    performedBy?: string;
}

export interface AuditLogFilters {
    entity?: AuditEntity;
    action?: AuditAction;
    startDate?: string | Date;
    endDate?: string | Date;
    page?: number;
    limit?: number;
}

export interface SerializedAuditLog {
    _id: string;
    action: AuditAction;
    entity: AuditEntity;
    entityId?: string;
    entityName?: string;
    changes: IAuditLogChanges | Record<string, unknown>;
    performedBy: string;
    ipAddress?: string;
    userAgent?: string;
    timestamp?: string;
    createdAt?: string;
}

export interface AuditLogResult {
    data: SerializedAuditLog[];
    total: number;
    page: number;
    totalPages: number;
}

/**
 * Log an audit event
 */
export async function logAudit({
    action,
    entity,
    entityId,
    entityName,
    changes = {},
    performedBy = 'system',
}: LogAuditParams): Promise<void> {
    try {
        await dbConnect();
        await sql`
            INSERT INTO audit_logs (action, entity, entity_id, entity_name, changes, performed_by, timestamp)
            VALUES (
                ${action},
                ${entity},
                ${entityId || null},
                ${entityName || null},
                ${JSON.stringify(changes)}::jsonb,
                ${performedBy || 'system'},
                NOW()
            )
        `;
    } catch {
        // Silently fail - audit logging should not break main operations
    }
}

/**
 * Calculate changes between old and new objects
 */
export function calculateChanges<T extends Record<string, unknown>>(
    oldObj: T | null | undefined,
    newObj: T | null | undefined,
    fields: (keyof T)[]
): IAuditLogChanges | null {
    const changes: IAuditLogChanges = {};

    fields.forEach(field => {
        const oldVal = oldObj?.[field];
        const newVal = newObj?.[field];

        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
            changes[field as string] = { old: oldVal, new: newVal };
        }
    });

    return Object.keys(changes).length > 0 ? changes : null;
}

/**
 * Get recent audit logs
 */
export async function getAuditLogs(filters: AuditLogFilters = {}): Promise<AuditLogResult> {
    await dbConnect();

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const entity = filters.entity ?? null;
    const action = filters.action ?? null;
    const startDate = filters.startDate ? new Date(filters.startDate) : null;
    const endDate = filters.endDate ? new Date(filters.endDate) : null;

    const [rows, countRows] = await Promise.all([
        sql<Array<{
            id: string;
            action: AuditAction;
            entity: AuditEntity;
            entity_id: string | null;
            entity_name: string | null;
            changes: unknown;
            performed_by: string;
            ip_address: string | null;
            user_agent: string | null;
            timestamp: string;
            created_at: string;
        }>>`
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
            WHERE (${entity}::text IS NULL OR entity = ${entity})
              AND (${action}::text IS NULL OR action = ${action})
              AND (${startDate}::timestamptz IS NULL OR timestamp >= ${startDate})
              AND (${endDate}::timestamptz IS NULL OR timestamp <= ${endDate})
            ORDER BY timestamp DESC
            LIMIT ${limit} OFFSET ${skip}
        `,
        sql<Array<{ total: number }>>`
            SELECT COUNT(*)::int AS total
            FROM audit_logs
            WHERE (${entity}::text IS NULL OR entity = ${entity})
              AND (${action}::text IS NULL OR action = ${action})
              AND (${startDate}::timestamptz IS NULL OR timestamp >= ${startDate})
              AND (${endDate}::timestamptz IS NULL OR timestamp <= ${endDate})
        `,
    ]);

    const total = countRows?.[0]?.total || 0;

    return {
        data: rows.map((r) => ({
            _id: r.id,
            action: r.action,
            entity: r.entity,
            entityId: r.entity_id || undefined,
            entityName: r.entity_name || undefined,
            changes: (r.changes as any) || {},
            performedBy: r.performed_by || 'system',
            ipAddress: r.ip_address || undefined,
            userAgent: r.user_agent || undefined,
            timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : undefined,
            createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
        })),
        total,
        page,
        totalPages: Math.ceil(total / limit),
    };
}
