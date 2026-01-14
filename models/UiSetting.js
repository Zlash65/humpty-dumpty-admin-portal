import mongoose from 'mongoose';

const UiSettingSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true, index: true, trim: true },
        value: { type: mongoose.Schema.Types.Mixed },
        category: { type: String, default: 'general' },
    },
    { timestamps: true }
);

export default mongoose.models.UiSetting || mongoose.model('UiSetting', UiSettingSchema);

