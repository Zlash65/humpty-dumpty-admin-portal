import mongoose, { Schema, model, models, Document, Types } from 'mongoose';

export type Gender = 'Male' | 'Female' | 'Other';

export interface IStudent {
    // Identification
    admissionNumber: string;

    // Personal Information
    firstName: string;
    lastName: string;
    dob?: Date | null;
    admissionDate: Date;
    gender: Gender;
    birthPlace?: string;
    religion?: string;
    address?: string;

    // Parent/Guardian Information
    fatherName?: string;
    motherName?: string;
    parentContact1?: string;
    parentContact2?: string;

    // Branch Assignment (for multi-branch support)
    branchId?: Types.ObjectId;

    // Financial
    feeScholarship: number;

    // Status
    isActive: boolean;
    joinedAt: Date;
}

export interface IStudentDocument extends IStudent, Document {
    // Virtual properties
    fullName: string;
}

const StudentSchema = new Schema<IStudent>({
    // Identification
    admissionNumber: {
        type: String,
        required: [true, 'Admission number is required.'],
        unique: true,
        uppercase: true,
        trim: true,
    },

    // Personal Information
    firstName: {
        type: String,
        required: [true, 'First name is required.'],
        trim: true,
    },
    lastName: {
        type: String,
        required: [true, 'Last name is required.'],
        trim: true,
    },
    // Electron app tracks `admission_date` (not DOB). We keep `dob` optional for
    // forward-compat, but the primary date field in this app is `admissionDate`.
    dob: {
        type: Date,
        default: null,
    },
    admissionDate: {
        type: Date,
        required: [true, 'Admission date is required.'],
        default: Date.now,
        index: true,
    },
    gender: {
        type: String,
        enum: ['Male', 'Female', 'Other'],
        required: true,
    },
    birthPlace: {
        type: String,
        trim: true,
    },
    religion: {
        type: String,
        trim: true,
    },
    address: {
        type: String,
        trim: true,
    },

    // Parent/Guardian Information
    fatherName: {
        type: String,
        trim: true,
    },
    motherName: {
        type: String,
        trim: true,
    },
    parentContact1: {
        type: String,
        trim: true,
    },
    parentContact2: {
        type: String,
        trim: true,
    },

    // Branch Assignment (for multi-branch support)
    branchId: {
        type: Schema.Types.ObjectId,
        ref: 'Branch',
        index: true,
    },

    // Financial
    feeScholarship: {
        type: Number,
        default: 0,
        min: [0, 'Scholarship cannot be negative'],
    },

    // Status
    isActive: {
        type: Boolean,
        default: true,
        index: true,
    },
    joinedAt: {
        type: Date,
        default: Date.now,
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for full name
StudentSchema.virtual('fullName').get(function(this: IStudentDocument): string {
    return `${this.firstName} ${this.lastName}`;
});

// Text index for search functionality
StudentSchema.index({ firstName: 'text', lastName: 'text', admissionNumber: 'text' });

// Compound index for common queries
StudentSchema.index({ branchId: 1, isActive: 1 });

const Student = (models.Student || model<IStudent>('Student', StudentSchema)) as mongoose.Model<IStudent>;
export default Student;
