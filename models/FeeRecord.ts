import mongoose, { Schema, model, models, Document, Types } from 'mongoose';

export type FeeStatus = 'Pending' | 'Partial' | 'Paid';
export type PaymentMode = 'Cash' | 'Bank Transfer' | 'Cheque' | 'UPI';
export type MonthPaymentStatus = 'paid' | 'partial' | 'unpaid';

export interface IFeeHead {
    amount: number;
    paid: number;
    status: FeeStatus;
}

export interface IFeeBreakdown {
    term1: number;
    term2: number;
    bookFee: number;
}

export interface ITransaction {
    receiptNumber: string;
    date: Date;
    amount: number;
    paymentMode: PaymentMode;
    // Cheque details (only if paymentMode is 'Cheque' or 'Bank Transfer')
    chequeNumber?: string;
    chequeDate?: Date;
    bankName?: string;
    payeeName?: string;
    // UPI details (only if paymentMode is 'UPI')
    upiId?: string;
    upiReference?: string;
    reference?: string;
    remarks?: string;
    breakdown: IFeeBreakdown;
    monthYear?: string;
    feeTerm: string;
}

export interface IMonthPayment {
    amount: number;
    paidDate: Date;
    status: MonthPaymentStatus;
}

export interface IFees {
    term1: IFeeHead;
    term2: IFeeHead;
    bookFee: IFeeHead;
}

export interface IFeeRecord {
    academicYearId: Types.ObjectId;
    studentId: Types.ObjectId;
    enrollmentId?: Types.ObjectId;
    branchId?: Types.ObjectId;
    fees: IFees;
    monthsPaid: Map<string, IMonthPayment>;
    transactions: ITransaction[];
}

export interface IFeeRecordDocument extends IFeeRecord, Document {
    // Virtual properties
    totalDue: number;
    totalPaid: number;
    balance: number;
    overallStatus: FeeStatus;
}

const FeeHeadSchema = new Schema<IFeeHead>({
    amount: { type: Number, required: true, default: 0 },
    paid: { type: Number, default: 0 },
    status: {
        type: String,
        enum: ['Pending', 'Partial', 'Paid'],
        default: 'Pending',
    }
}, { _id: false });

const TransactionSchema = new Schema<ITransaction>({
    receiptNumber: {
        type: String,
        required: true
    },
    date: { type: Date, default: Date.now },
    amount: { type: Number, required: true },
    paymentMode: {
        type: String,
        enum: ['Cash', 'Bank Transfer', 'Cheque', 'UPI'],
        required: true,
    },
    // Cheque details (only if paymentMode is 'Cheque' or 'Bank Transfer')
    chequeNumber: String,
    chequeDate: Date,
    bankName: String,
    payeeName: String,

    // UPI details (only if paymentMode is 'UPI')
    upiId: String,           // UPI transaction ID
    upiReference: String,    // UPI reference number

    reference: String,
    remarks: String,
    breakdown: {
        term1: { type: Number, default: 0 },
        term2: { type: Number, default: 0 },
        bookFee: { type: Number, default: 0 },
    },
    // For monthly tracking
    monthYear: String,  // e.g., "January 2024"

    // Electron parity: original fee_term ("term1", "term2", "books", ...)
    feeTerm: { type: String, default: '' },
});

const FeeRecordSchema = new Schema<IFeeRecord>({
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
    enrollmentId: {
        type: Schema.Types.ObjectId,
        ref: 'StudentEnrollment',
    },
    branchId: {
        type: Schema.Types.ObjectId,
        ref: 'Branch',
        index: true,
    },

    fees: {
        term1: { type: FeeHeadSchema, default: () => ({ amount: 0, paid: 0, status: 'Pending' }) },
        term2: { type: FeeHeadSchema, default: () => ({ amount: 0, paid: 0, status: 'Pending' }) },
        bookFee: { type: FeeHeadSchema, default: () => ({ amount: 0, paid: 0, status: 'Pending' }) },
    },

    // Monthly payment tracking (Electron's months_paid equivalent)
    monthsPaid: {
        type: Map,
        of: {
            amount: Number,
            paidDate: Date,
            status: { type: String, enum: ['paid', 'partial', 'unpaid'] }
        },
        default: () => new Map()
    },

    transactions: [TransactionSchema]

}, { timestamps: true });

// Unique fee record per student per year
FeeRecordSchema.index({ academicYearId: 1, studentId: 1 }, { unique: true });

// Receipt numbers must be unique across the whole system (Electron parity)
FeeRecordSchema.index(
    { 'transactions.receiptNumber': 1 },
    {
        unique: true,
        // Prevent index build failures if any legacy docs contain null/missing receipt numbers.
        // Note: for array fields, the filter matches when *any* element matches.
        partialFilterExpression: { 'transactions.receiptNumber': { $type: 'string' } },
    }
);

// Virtuals for calculated fields
FeeRecordSchema.virtual('totalDue').get(function(this: IFeeRecordDocument): number {
    return (this.fees?.term1?.amount || 0) + (this.fees?.term2?.amount || 0) + (this.fees?.bookFee?.amount || 0);
});

FeeRecordSchema.virtual('totalPaid').get(function(this: IFeeRecordDocument): number {
    return (this.fees?.term1?.paid || 0) + (this.fees?.term2?.paid || 0) + (this.fees?.bookFee?.paid || 0);
});

FeeRecordSchema.virtual('balance').get(function(this: IFeeRecordDocument): number {
    return this.totalDue - this.totalPaid;
});

FeeRecordSchema.virtual('overallStatus').get(function(this: IFeeRecordDocument): FeeStatus {
    const totalDue = this.totalDue;
    const totalPaid = this.totalPaid;
    if (totalPaid >= totalDue) return 'Paid';
    if (totalPaid > 0) return 'Partial';
    return 'Pending';
});

// Enable virtuals in JSON
FeeRecordSchema.set('toJSON', { virtuals: true });
FeeRecordSchema.set('toObject', { virtuals: true });

const FeeRecord = (models.FeeRecord || model<IFeeRecord>('FeeRecord', FeeRecordSchema)) as mongoose.Model<IFeeRecord>;
export default FeeRecord;
