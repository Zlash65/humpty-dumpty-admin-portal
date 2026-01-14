import mongoose, { Schema, model, models, Document } from 'mongoose';

export interface IAcademicYear {
    name: string;
    startDate: Date;
    endDate: Date;
    isActive: boolean;
    isLocked: boolean;
}

export interface IAcademicYearDocument extends IAcademicYear, Document {}

const AcademicYearSchema = new Schema<IAcademicYear>({
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
    }
}, { timestamps: true });

const AcademicYear = (models.AcademicYear || model<IAcademicYear>('AcademicYear', AcademicYearSchema)) as mongoose.Model<IAcademicYear>;
export default AcademicYear;
