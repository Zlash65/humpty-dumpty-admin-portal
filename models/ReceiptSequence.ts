import mongoose, { Schema, model, models, Document } from 'mongoose';

export interface IReceiptSequence {
    prefix: 'C' | 'B';
    lastNumber: number;
}

export interface IReceiptSequenceDocument extends IReceiptSequence, Document {}

const ReceiptSequenceSchema = new Schema<IReceiptSequence>({
    prefix: {
        type: String,
        required: true,
        uppercase: true,
        enum: ['C', 'B'],
        unique: true,
        index: true,
    },
    lastNumber: {
        type: Number,
        default: 0,
        min: 0,
    },
}, { timestamps: true });

const ReceiptSequence = (models.ReceiptSequence || model<IReceiptSequence>('ReceiptSequence', ReceiptSequenceSchema)) as mongoose.Model<IReceiptSequence>;
export default ReceiptSequence;
