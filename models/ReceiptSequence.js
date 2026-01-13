import mongoose from 'mongoose';

const ReceiptSequenceSchema = new mongoose.Schema({
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

export default mongoose.models.ReceiptSequence || mongoose.model('ReceiptSequence', ReceiptSequenceSchema);

