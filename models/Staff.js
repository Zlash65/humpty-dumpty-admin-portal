import mongoose from 'mongoose';

const TeacherAssignmentSchema = new mongoose.Schema({
    className: {
        type: String,
        required: true
    },
    shiftName: String,
    division: String
}, { _id: false });

const StaffSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Staff name is required'],
        trim: true
    },
    contact: {
        type: String,
        trim: true
    },
    email: {
        type: String,
        trim: true,
        lowercase: true
    },
    staffType: {
        type: String,
        required: [true, 'Staff type is required'],
        enum: ['office', 'teacher'],
        default: 'office'
    },
    role: {
        type: String,
        trim: true
    },
    branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        index: true
    },
    // Teacher-specific: class assignments
    assignments: [TeacherAssignmentSchema],
    isActive: {
        type: Boolean,
        default: true,
        index: true
    }
}, { timestamps: true });

// Index for searching
StaffSchema.index({ name: 'text', contact: 'text', role: 'text' });

// Compound index for common queries
StaffSchema.index({ branchId: 1, staffType: 1, isActive: 1 });

export default mongoose.models.Staff || mongoose.model('Staff', StaffSchema);
