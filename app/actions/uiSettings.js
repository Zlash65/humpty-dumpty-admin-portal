'use server';

import dbConnect from '@/lib/db';
import UiSetting from '@/models/UiSetting';

export async function getUiSetting(key) {
    if (!key) return null;
    await dbConnect();
    const doc = await UiSetting.findOne({ key }).lean();
    return doc?.value ?? null;
}

export async function setUiSetting(key, value, category = 'general') {
    if (!key) return { error: 'Key is required' };
    await dbConnect();
    await UiSetting.findOneAndUpdate(
        { key },
        { key, value, category },
        { upsert: true, new: true, runValidators: true }
    );
    return { success: true };
}

