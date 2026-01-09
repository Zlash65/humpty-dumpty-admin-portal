import mongoose from 'mongoose';

const AcademicYearSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please provide a name (e.g., 2024-2025).'],
        unique: true,
        trim: true,
    },
    startDate: {
        type: Date,
        required: [true, 'Please provide a start date.'],
    },
    endDate: {
        type: Date,
        required: [true, 'Please provide an end date.'],
    },
    isActive: {
        type: Boolean,
        default: false,
        // Note: Logic to ensure only ONE is active will be in the service layer
    },
    isLocked: {
        type: Boolean,
        default: false,
        description: 'If locked, data for this year cannot be modified.',
    }
}, { timestamps: true });

export default mongoose.models.AcademicYear || mongoose.model('AcademicYear', AcademicYearSchema);
