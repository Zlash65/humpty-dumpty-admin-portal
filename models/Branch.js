import mongoose from 'mongoose';

const BranchSchema = new mongoose.Schema({
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
BranchSchema.pre('save', function(next) {
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

export default mongoose.models.Branch || mongoose.model('Branch', BranchSchema);
