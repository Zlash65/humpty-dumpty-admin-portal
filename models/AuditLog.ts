import mongoose, { Schema, model, models, Document, Model, Types } from 'mongoose';

export type AuditAction = 'create' | 'update' | 'delete' | 'login' | 'logout';
export type AuditEntity = 'student' | 'staff' | 'fee' | 'enrollment' | 'transport' | 'branch' | 'academicYear' | 'settings' | 'user';

export interface IAuditLogChanges {
    [field: string]: {
        old: unknown;
        new: unknown;
    };
}

export interface IAuditLog {
    action: AuditAction;
    entity: AuditEntity;
    entityId?: Types.ObjectId;
    entityName?: string;
    changes: IAuditLogChanges | Record<string, unknown>;
    performedBy: string;
    ipAddress?: string;
    userAgent?: string;
    timestamp: Date;
}

export interface IAuditLogDocument extends IAuditLog, Document {}

const AuditLogSchema = new Schema<IAuditLog>({
    action: {
        type: String,
        enum: ['create', 'update', 'delete', 'login', 'logout'],
        required: true,
        index: true,
    },
    entity: {
        type: String,
        enum: ['student', 'staff', 'fee', 'enrollment', 'transport', 'branch', 'academicYear', 'settings', 'user'],
        required: true,
        index: true,
    },
    entityId: {
        type: Schema.Types.ObjectId,
        index: true,
    },
    entityName: String,
    changes: {
        type: Schema.Types.Mixed,
        default: {},
    },
    performedBy: {
        type: String,
        default: 'system',
    },
    ipAddress: String,
    userAgent: String,
    timestamp: {
        type: Date,
        default: Date.now,
        index: true,
    },
}, { timestamps: true });

AuditLogSchema.index({ timestamp: -1 });
AuditLogSchema.index({ entity: 1, timestamp: -1 });

const AuditLog: Model<IAuditLog> = models.AuditLog || model<IAuditLog>('AuditLog', AuditLogSchema);
export default AuditLog;
