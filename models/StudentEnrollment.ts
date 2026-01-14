import mongoose, { Schema, model, models, Document, Types } from 'mongoose';

export type EnrollmentStatus = 'Active' | 'Transferred' | 'Expelled' | 'Graduated';

export interface IStudentEnrollment {
    academicYearId: Types.ObjectId;
    studentId: Types.ObjectId;
    class: string;
    section: string;
    rollNumber?: string;
    shiftName: string;
    status: EnrollmentStatus;
    joinDate: Date;
    leaveDate?: Date;
}

export interface IStudentEnrollmentDocument extends IStudentEnrollment, Document {}

const StudentEnrollmentSchema = new Schema<IStudentEnrollment>({
    academicYearId: {
        type: Schema.Types.ObjectId,
        ref: 'AcademicYear',
        required: true,
        index: true,
    },
    studentId: {
        type: Schema.Types.ObjectId,
        ref: 'Student',
        required: true,
        index: true,
    },
    class: {
        type: String,
        required: [true, 'Class name is required.'],
        trim: true,
    },
    section: {
        type: String,
        required: [true, 'Section is required.'],
        trim: true,
    },
    rollNumber: {
        type: String,
        trim: true,
    },
    shiftName: {
        type: String,
        default: '',
        trim: true,
    },
    status: {
        type: String,
        enum: ['Active', 'Transferred', 'Expelled', 'Graduated'],
        default: 'Active',
    },
    joinDate: {
        type: Date,
        default: Date.now,
    },
    leaveDate: {
        type: Date,
    }
}, { timestamps: true });

// Compound unique index to ensure a student is enrolled only ONCE per academic year
StudentEnrollmentSchema.index({ academicYearId: 1, studentId: 1 }, { unique: true });

const StudentEnrollment = (models.StudentEnrollment || model<IStudentEnrollment>('StudentEnrollment', StudentEnrollmentSchema)) as mongoose.Model<IStudentEnrollment>;
export default StudentEnrollment;
