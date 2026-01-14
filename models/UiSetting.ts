import mongoose, { Schema, model, models, Document } from 'mongoose';

export interface IUiSetting {
    key: string;
    value: unknown;
    category: string;
}

export interface IUiSettingDocument extends IUiSetting, Document {}

const UiSettingSchema = new Schema<IUiSetting>(
    {
        key: { type: String, required: true, unique: true, index: true, trim: true },
        value: { type: Schema.Types.Mixed },
        category: { type: String, default: 'general' },
    },
    { timestamps: true }
);

const UiSetting = (models.UiSetting || model<IUiSetting>('UiSetting', UiSettingSchema)) as mongoose.Model<IUiSetting>;
export default UiSetting;
