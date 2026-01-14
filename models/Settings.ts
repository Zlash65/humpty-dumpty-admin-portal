import mongoose, { Schema, model, models, Document } from 'mongoose';

export interface ISettings {
    schoolName: string;
    schoolTagline: string;
    address: string;
    phone: string;
    phone2: string;
    phone3: string;
    email: string;
    logoUrl: string;
}

export interface ISettingsDocument extends ISettings, Document {}

const SettingsSchema = new Schema<ISettings>({
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

const Settings = (models.Settings || model<ISettings>('Settings', SettingsSchema)) as mongoose.Model<ISettings>;
export default Settings;
