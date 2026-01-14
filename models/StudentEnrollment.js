import mongoose from 'mongoose';

const StudentEnrollmentSchema = new mongoose.Schema({
    academicYearId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AcademicYear',
        required: true,
        index: true,
    },
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
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

export default mongoose.models.StudentEnrollment || mongoose.model('StudentEnrollment', StudentEnrollmentSchema);
