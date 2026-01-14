import dbConnect from './db';
import AuditLog, { AuditAction, AuditEntity, IAuditLogChanges } from '@/models/AuditLog';
import { Types } from 'mongoose';

export interface LogAuditParams {
    action: AuditAction;
    entity: AuditEntity;
    entityId?: string | Types.ObjectId;
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
        await AuditLog.create({
            action,
            entity,
            entityId,
            entityName,
            changes,
            performedBy,
            timestamp: new Date(),
        });
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

    interface QueryType {
        entity?: AuditEntity;
        action?: AuditAction;
        timestamp?: {
            $gte?: Date;
            $lte?: Date;
        };
    }

    const query: QueryType = {};
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    if (filters.entity) {
        query.entity = filters.entity;
    }

    if (filters.action) {
        query.action = filters.action;
    }

    if (filters.startDate || filters.endDate) {
        query.timestamp = {};
        if (filters.startDate) {
            query.timestamp.$gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
            query.timestamp.$lte = new Date(filters.endDate);
        }
    }

    const [logs, total] = await Promise.all([
        AuditLog.find(query)
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        AuditLog.countDocuments(query)
    ]);

    return {
        data: logs.map(log => ({
            ...log,
            _id: log._id.toString(),
            entityId: log.entityId?.toString(),
            timestamp: log.timestamp?.toISOString(),
            createdAt: (log as { createdAt?: Date }).createdAt?.toISOString(),
        })) as SerializedAuditLog[],
        total,
        page,
        totalPages: Math.ceil(total / limit)
    };
}
