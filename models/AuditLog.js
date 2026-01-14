import mongoose from 'mongoose';

const AuditLogSchema = new mongoose.Schema({
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
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    },
    entityName: String,
    changes: {
        type: mongoose.Schema.Types.Mixed,
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

export default mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);
