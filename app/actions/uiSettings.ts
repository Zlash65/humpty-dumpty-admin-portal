'use server';

import dbConnect from '@/lib/db';
import UiSetting from '@/models/UiSetting';
import type { IUiSettingDocument } from '@/types';

interface ActionResult {
    success?: boolean;
    error?: string;
}

interface UiSettingLean {
    key?: string;
    value?: unknown;
    category?: string;
}

export async function getUiSetting(key: string): Promise<unknown | null> {
    if (!key) return null;
    await dbConnect();
    const doc = await UiSetting.findOne({ key }).lean() as UiSettingLean | null;
    return doc?.value ?? null;
}

export async function setUiSetting(key: string, value: unknown, category: string = 'general'): Promise<ActionResult> {
    if (!key) return { error: 'Key is required' };
    await dbConnect();
    await UiSetting.findOneAndUpdate(
        { key },
        { key, value, category },
        { upsert: true, new: true, runValidators: true }
    );
    return { success: true };
}
