import mongoose from 'mongoose';

const StudentSchema = new mongoose.Schema({
    admissionNumber: {
        type: String,
        required: [true, 'Admission number is required.'],
        unique: true,
        uppercase: true,
        trim: true,
    },
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
    contactNumber: {
        type: String,
        trim: true,
    },
    address: {
        type: String,
        trim: true,
    },
    isActive: {
        type: Boolean,
        default: true,
        description: 'False if expelled or transferred out permanently.',
    },
    joinedAt: {
        type: Date,
        default: Date.now,
    }
}, { timestamps: true });

export default mongoose.models.Student || mongoose.model('Student', StudentSchema);
