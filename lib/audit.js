import dbConnect from './db';
import AuditLog from '@/models/AuditLog';

/**
 * Log an audit event
 * @param {Object} params
 * @param {string} params.action - create, update, delete, login, logout
 * @param {string} params.entity - student, staff, fee, etc.
 * @param {string} params.entityId - MongoDB ObjectId
 * @param {string} params.entityName - Human readable name
 * @param {Object} params.changes - { field: { old: value, new: value } }
 * @param {string} params.performedBy - Username
 */
export async function logAudit({
    action,
    entity,
    entityId,
    entityName,
    changes = {},
    performedBy = 'system',
}) {
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
export function calculateChanges(oldObj, newObj, fields) {
    const changes = {};

    fields.forEach(field => {
        const oldVal = oldObj?.[field];
        const newVal = newObj?.[field];

        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
            changes[field] = { old: oldVal, new: newVal };
        }
    });

    return Object.keys(changes).length > 0 ? changes : null;
}

/**
 * Get recent audit logs
 */
export async function getAuditLogs(filters = {}) {
    await dbConnect();

    const query = {};
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
            createdAt: log.createdAt?.toISOString(),
        })),
        total,
        page,
        totalPages: Math.ceil(total / limit)
    };
}
