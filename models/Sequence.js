import mongoose from 'mongoose';

const SequenceSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true, index: true },
        value: { type: Number, default: 0, min: 0 },
    },
    { timestamps: true }
);

export default mongoose.models.Sequence || mongoose.model('Sequence', SequenceSchema);

