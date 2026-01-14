import mongoose, { Schema, model, models, Document, Types } from 'mongoose';

export interface IFeeComponents {
    term1: number;
    term2: number;
    bookFee: number;
}

export interface IFeeStructure {
    academicYearId: Types.ObjectId;
    branchId?: Types.ObjectId;
    class: string;
    shiftName: string;
    startTime: string;
    endTime: string;
    numDivisions: number;
    components: IFeeComponents;
}

export interface IFeeStructureDocument extends IFeeStructure, Document {}

const FeeStructureSchema = new Schema<IFeeStructure>({
    academicYearId: {
        type: Schema.Types.ObjectId,
        ref: 'AcademicYear',
        required: true,
        index: true,
    },
    branchId: {
        type: Schema.Types.ObjectId,
        ref: 'Branch',
        index: true,
    },
    class: {
        type: String,
        required: true,
        trim: true,
    },
    // Optional: shift support (Electron has shift_name on classes)
    shiftName: {
        type: String,
        default: '',
        trim: true,
    },
    // Electron parity: classes table stores these per class entry (branch + shift).
    startTime: {
        type: String,
        default: '',
        trim: true,
    },
    endTime: {
        type: String,
        default: '',
        trim: true,
    },
    numDivisions: {
        type: Number,
        default: 1,
        min: 1,
    },
    components: {
        term1: { type: Number, default: 0 },
        term2: { type: Number, default: 0 },
        bookFee: { type: Number, default: 0 },
    }
}, { timestamps: true });

// Ensure one fee structure per class per year per branch/shift (Electron parity)
// Use a partial index so legacy docs without `branchId` don't break index builds.
FeeStructureSchema.index(
    { academicYearId: 1, branchId: 1, class: 1, shiftName: 1 },
    { unique: true, partialFilterExpression: { branchId: { $type: 'objectId' } } }
);

const FeeStructure = (models.FeeStructure || model<IFeeStructure>('FeeStructure', FeeStructureSchema)) as mongoose.Model<IFeeStructure>;
export default FeeStructure;
