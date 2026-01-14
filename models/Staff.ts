import mongoose, { Schema, model, models, Document, Types } from 'mongoose';

export type StaffType = 'office' | 'teacher';

export interface ITeacherAssignment {
    classEntryId?: Types.ObjectId;
    branchId?: Types.ObjectId;
    className: string;
    shiftName?: string;
    division?: string;
}

export interface IStaff {
    name: string;
    contact?: string;
    email?: string;
    staffType: StaffType;
    role?: string;
    branchId?: Types.ObjectId;
    assignments: ITeacherAssignment[];
    isActive: boolean;
}

export interface IStaffDocument extends IStaff, Document {}

const TeacherAssignmentSchema = new Schema<ITeacherAssignment>({
    // Stable reference to the selected class entry (FeeStructure document).
    // This avoids ambiguity when multiple branches have the same class name/shift,
    // and preserves the assignment even if the class is renamed (doc id remains).
    classEntryId: {
        type: Schema.Types.ObjectId,
        ref: 'FeeStructure',
        index: true,
        required: false,
    },
    // Branch context for the assignment (Electron parity: teacher_assignments -> classes -> branch_id).
    branchId: {
        type: Schema.Types.ObjectId,
        ref: 'Branch',
        index: true,
        required: false,
    },
    className: {
        type: String,
        required: true
    },
    shiftName: String,
    division: String
}, { _id: false });

const StaffSchema = new Schema<IStaff>({
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
        type: Schema.Types.ObjectId,
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

const Staff = (models.Staff || model<IStaff>('Staff', StaffSchema)) as mongoose.Model<IStaff>;
export default Staff;
