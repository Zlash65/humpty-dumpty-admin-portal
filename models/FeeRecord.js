import mongoose from 'mongoose';

const FeeHeadSchema = new mongoose.Schema({
    amount: { type: Number, required: true },
    paid: { type: Number, default: 0 },
    status: {
        type: String,
        enum: ['Pending', 'Partial', 'Paid'],
        default: 'Pending',
    }
}, { _id: false });

const TransactionSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    amount: { type: Number, required: true },
    paymentMode: {
        type: String,
        enum: ['Cash', 'Bank Transfer', 'Cheque'],
        required: true,
    },
    reference: { type: String }, // e.g. Cheque No
    remarks: { type: String },
    breakdown: {
        term1: { type: Number, default: 0 },
        term2: { type: Number, default: 0 },
        bookFee: { type: Number, default: 0 },
    }
});

const FeeRecordSchema = new mongoose.Schema({
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
    enrollmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'StudentEnrollment',
    },

    fees: {
        term1: { type: FeeHeadSchema, default: () => ({ amount: 0, paid: 0, status: 'Pending' }) },
        term2: { type: FeeHeadSchema, default: () => ({ amount: 0, paid: 0, status: 'Pending' }) },
        bookFee: { type: FeeHeadSchema, default: () => ({ amount: 0, paid: 0, status: 'Pending' }) },
    },

    transactions: [TransactionSchema]

}, { timestamps: true });

// Unique fee record per student per year
FeeRecordSchema.index({ academicYearId: 1, studentId: 1 }, { unique: true });

export default mongoose.models.FeeRecord || mongoose.model('FeeRecord', FeeRecordSchema);
