import mongoose from 'mongoose';

const StudentSchema = new mongoose.Schema({
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
    dob: {
        type: Date,
        required: [true, 'Date of Birth is required.'],
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
        type: mongoose.Schema.Types.ObjectId,
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
StudentSchema.virtual('fullName').get(function() {
    return `${this.firstName} ${this.lastName}`;
});

// Text index for search functionality
StudentSchema.index({ firstName: 'text', lastName: 'text', admissionNumber: 'text' });

// Compound index for common queries
StudentSchema.index({ branchId: 1, isActive: 1 });

export default mongoose.models.Student || mongoose.model('Student', StudentSchema);
