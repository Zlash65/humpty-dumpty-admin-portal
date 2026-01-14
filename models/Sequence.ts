import mongoose, { Schema, model, models, Document } from 'mongoose';

export interface ISequence {
    key: string;
    value: number;
}

export interface ISequenceDocument extends ISequence, Document {}

const SequenceSchema = new Schema<ISequence>(
    {
        key: { type: String, required: true, unique: true, index: true },
        value: { type: Number, default: 0, min: 0 },
    },
    { timestamps: true }
);

const Sequence = (models.Sequence || model<ISequence>('Sequence', SequenceSchema)) as mongoose.Model<ISequence>;
export default Sequence;
