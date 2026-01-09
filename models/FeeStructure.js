import mongoose from 'mongoose';

const FeeStructureSchema = new mongoose.Schema({
    academicYearId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AcademicYear',
        required: true,
        index: true,
    },
    class: {
        type: String,
        required: true,
        trim: true,
    },
    components: {
        term1: { type: Number, default: 0 },
        term2: { type: Number, default: 0 },
        bookFee: { type: Number, default: 0 },
    }
}, { timestamps: true });

// Ensure one fee structure per class per year
FeeStructureSchema.index({ academicYearId: 1, class: 1 }, { unique: true });

export default mongoose.models.FeeStructure || mongoose.model('FeeStructure', FeeStructureSchema);
