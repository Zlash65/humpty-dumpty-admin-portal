import mongoose, { Schema, model, models, Document, CallbackWithoutResultAndOptionalError } from 'mongoose';

export interface IBranch {
    name: string;
    code?: string;
    address?: string;
    contact?: string;
    email?: string;
    isActive: boolean;
}

export interface IBranchDocument extends IBranch, Document {}

const BranchSchema = new Schema<IBranch>({
    name: {
        type: String,
        required: [true, 'Branch name is required'],
        unique: true,
        trim: true
    },
    code: {
        type: String,
        unique: true,
        sparse: true,
        uppercase: true,
        trim: true
    },
    address: {
        type: String,
        trim: true
    },
    contact: {
        type: String,
        trim: true
    },
    email: {
        type: String,
        trim: true,
        lowercase: true
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true
    }
}, { timestamps: true });

// Pre-save hook to generate code from name if not provided
BranchSchema.pre('save', function(this: IBranchDocument, next: CallbackWithoutResultAndOptionalError) {
    if (!this.code && this.name) {
        // Generate code from first letters of each word
        this.code = this.name
            .split(' ')
            .map(word => word[0])
            .join('')
            .toUpperCase()
            .substring(0, 5);
    }
    next();
});

const Branch = (models.Branch || model<IBranch>('Branch', BranchSchema)) as mongoose.Model<IBranch>;
export default Branch;
