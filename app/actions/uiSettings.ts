'use server';

import dbConnect from '@/lib/db';
import { sql } from '@/lib/sql';

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
    const rows = await sql<Array<{ value: unknown }>>`
        SELECT value
        FROM ui_settings
        WHERE key = ${key}
        LIMIT 1
    `;
    return rows?.[0]?.value ?? null;
}

export async function setUiSetting(key: string, value: unknown, category: string = 'general'): Promise<ActionResult> {
    if (!key) return { error: 'Key is required' };
    await dbConnect();
    await sql`
        INSERT INTO ui_settings (key, value, category, updated_at)
        VALUES (${key}, ${JSON.stringify(value)}::jsonb, ${category}, NOW())
        ON CONFLICT (key)
        DO UPDATE SET
            value = EXCLUDED.value,
            category = EXCLUDED.category,
            updated_at = NOW()
    `;
    return { success: true };
}
