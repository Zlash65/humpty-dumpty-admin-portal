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

function normalizeEmptyLike(value: unknown): unknown {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string' && value === '') return null;
    return value;
}

function valuesEquivalent(a: unknown, b: unknown): boolean {
    const na = normalizeEmptyLike(a);
    const nb = normalizeEmptyLike(b);
    try {
        return JSON.stringify(na) === JSON.stringify(nb);
    } catch {
        return na === nb;
    }
}

function isChangeValue(value: unknown): value is { old?: unknown; new?: unknown } {
    if (!value || typeof value !== 'object') return false;
    return Object.prototype.hasOwnProperty.call(value, 'old') || Object.prototype.hasOwnProperty.call(value, 'new');
}

function sanitizeAuditChanges(changes: unknown): Record<string, unknown> {
    if (!changes || typeof changes !== 'object') return {};

    const input = changes as Record<string, unknown>;
    const out: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(input)) {
        // Diff-style: { field: { old, new } }
        if (isChangeValue(value)) {
            if (valuesEquivalent(value.old, value.new)) continue;
            out[key] = { old: value.old ?? null, new: value.new ?? null };
            continue;
        }

        // Snapshot-style: omit empty values (common noise)
        if (normalizeEmptyLike(value) === null) continue;
        out[key] = value;
    }

    return out;
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
        const sanitized = sanitizeAuditChanges(changes);
        await sql`
            INSERT INTO audit_logs (action, entity, entity_id, entity_name, changes, performed_by, timestamp)
            VALUES (
                ${action},
                ${entity},
                ${entityId || null},
                ${entityName || null},
                ${JSON.stringify(sanitized)}::jsonb,
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

    const normalize = (value: unknown): unknown => {
        if (value === undefined || value === null) return null;
        if (typeof value === 'string' && value === '') return null;
        if (value instanceof Date) return value.toISOString();
        if (Array.isArray(value)) return value.map(normalize);
        if (value && typeof value === 'object') {
            const obj = value as Record<string, unknown>;
            const keys = Object.keys(obj).sort();
            const out: Record<string, unknown> = {};
            for (const k of keys) out[k] = normalize(obj[k]);
            return out;
        }
        return value;
    };

    fields.forEach(field => {
        const oldVal = oldObj?.[field];
        const newVal = newObj?.[field];

        const oldNorm = normalize(oldVal);
        const newNorm = normalize(newVal);

        if (JSON.stringify(oldNorm) !== JSON.stringify(newNorm)) {
            changes[field as string] = { old: oldVal, new: newVal };
        }
    });

    return Object.keys(changes).length > 0 ? changes : null;
}
