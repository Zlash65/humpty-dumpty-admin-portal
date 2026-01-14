import mongoose from 'mongoose';

const SettingsSchema = new mongoose.Schema({
    schoolName: {
        type: String,
        default: 'School'
    },
    schoolTagline: {
        type: String,
        default: 'Where Learning Meets Excellence'
    },
    address: {
        type: String,
        default: ''
    },
    phone: {
        type: String,
        default: ''
    },
    phone2: {
        type: String,
        default: ''
    },
    phone3: {
        type: String,
        default: ''
    },
    email: {
        type: String,
        default: ''
    },
    logoUrl: {
        type: String,
        default: ''
    },
}, {
    timestamps: true
});

export default mongoose.models.Settings || mongoose.model('Settings', SettingsSchema);
