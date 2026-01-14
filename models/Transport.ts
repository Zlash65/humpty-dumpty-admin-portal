import mongoose, { Schema, model, models, Document, Types } from 'mongoose';

export interface ITransport {
    driverName: string;
    driverContact: string;
    route: string;
    vehicleType: string;
    vehicleNumber: string;
    capacity?: number;
    branchId?: Types.ObjectId;
    isActive: boolean;
}

export interface ITransportDocument extends ITransport, Document {}

const TransportSchema = new Schema<ITransport>({
    driverName: {
        type: String,
        required: [true, 'Driver name is required'],
        trim: true
    },
    driverContact: {
        type: String,
        required: [true, 'Driver contact is required'],
        trim: true
    },
    route: {
        type: String,
        required: [true, 'Route is required'],
        trim: true
    },
    vehicleType: {
        type: String,
        required: [true, 'Vehicle type is required'],
        trim: true
    },
    vehicleNumber: {
        type: String,
        required: [true, 'Vehicle number is required'],
        unique: true,
        uppercase: true,
        trim: true
    },
    capacity: {
        type: Number,
        min: 1
    },
    branchId: {
        type: Schema.Types.ObjectId,
        ref: 'Branch',
        index: true
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true
    }
}, { timestamps: true });

// Index for searching
TransportSchema.index({ driverName: 'text', route: 'text', vehicleNumber: 'text' });

const Transport = (models.Transport || model<ITransport>('Transport', TransportSchema)) as mongoose.Model<ITransport>;
export default Transport;
