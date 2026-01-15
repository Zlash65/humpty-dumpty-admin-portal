'use server';

import dbConnect from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { getCurrentUsername } from '@/lib/currentUser';
import { sql } from '@/lib/sql';

// Types for action results
interface ActionResult {
    success?: boolean;
    error?: string;
}

interface SerializedSettings {
    _id?: string;
    schoolName: string;
    schoolTagline: string;
    address: string;
    phone: string;
    phone2: string;
    phone3: string;
    email: string;
    logoUrl: string;
}

const defaultSettings: SerializedSettings = {
    schoolName: 'School',
    schoolTagline: 'Where Learning Meets Excellence',
    address: '',
    phone: '',
    phone2: '',
    phone3: '',
    email: '',
    logoUrl: '',
};

export async function getSettings(): Promise<SerializedSettings> {
    await dbConnect();

    const rows = await sql<Array<{
        id: string;
        school_name: string;
        school_tagline: string;
        address: string;
        phone: string;
        phone2: string;
        phone3: string;
        email: string;
        logo_url: string;
    }>>`SELECT id, school_name, school_tagline, address, phone, phone2, phone3, email, logo_url FROM settings WHERE singleton = true LIMIT 1`;

    if (!rows?.length) {
        await sql`
            INSERT INTO settings (singleton, school_name, school_tagline, address, phone, phone2, phone3, email, logo_url)
            VALUES (
                true,
                ${defaultSettings.schoolName},
                ${defaultSettings.schoolTagline},
                ${defaultSettings.address},
                ${defaultSettings.phone},
                ${defaultSettings.phone2},
                ${defaultSettings.phone3},
                ${defaultSettings.email},
                ${defaultSettings.logoUrl}
            )
            ON CONFLICT (singleton) DO NOTHING
        `;
        const created = await sql<Array<{
            id: string;
            school_name: string;
            school_tagline: string;
            address: string;
            phone: string;
            phone2: string;
            phone3: string;
            email: string;
            logo_url: string;
        }>>`SELECT id, school_name, school_tagline, address, phone, phone2, phone3, email, logo_url FROM settings WHERE singleton = true LIMIT 1`;
        const s = created?.[0];
        return {
            _id: s?.id,
            schoolName: s?.school_name || defaultSettings.schoolName,
            schoolTagline: s?.school_tagline || defaultSettings.schoolTagline,
            address: s?.address || '',
            phone: s?.phone || '',
            phone2: s?.phone2 || '',
            phone3: s?.phone3 || '',
            email: s?.email || '',
            logoUrl: s?.logo_url || '',
        };
    }

    const s = rows[0];
    return {
        _id: s.id,
        schoolName: s.school_name || defaultSettings.schoolName,
        schoolTagline: s.school_tagline || defaultSettings.schoolTagline,
        address: s.address || '',
        phone: s.phone || '',
        phone2: s.phone2 || '',
        phone3: s.phone3 || '',
        email: s.email || '',
        logoUrl: s.logo_url || '',
    };
}

export async function updateSettings(formData: FormData): Promise<ActionResult> {
    await dbConnect();

    const data = {
        schoolName: (formData.get('schoolName') as string | null) || defaultSettings.schoolName,
        schoolTagline: (formData.get('schoolTagline') as string | null) || defaultSettings.schoolTagline,
        address: (formData.get('address') as string | null) || '',
        phone: (formData.get('phone') as string | null) || '',
        phone2: (formData.get('phone2') as string | null) || '',
        phone3: (formData.get('phone3') as string | null) || '',
        email: (formData.get('email') as string | null) || '',
        logoUrl: (formData.get('logoUrl') as string | null) || '',
    };

    try {
        const upserted = await sql<Array<{ id: string }>>`
            INSERT INTO settings (singleton, school_name, school_tagline, address, phone, phone2, phone3, email, logo_url)
            VALUES (
                true,
                ${data.schoolName},
                ${data.schoolTagline},
                ${data.address},
                ${data.phone},
                ${data.phone2},
                ${data.phone3},
                ${data.email},
                ${data.logoUrl}
            )
            ON CONFLICT (singleton)
            DO UPDATE SET
                school_name = EXCLUDED.school_name,
                school_tagline = EXCLUDED.school_tagline,
                address = EXCLUDED.address,
                phone = EXCLUDED.phone,
                phone2 = EXCLUDED.phone2,
                phone3 = EXCLUDED.phone3,
                email = EXCLUDED.email,
                logo_url = EXCLUDED.logo_url,
                updated_at = NOW()
            RETURNING id
        `;

        revalidatePath('/dashboard');
        revalidatePath('/dashboard/settings');
        revalidatePath('/');

        await logAudit({
            action: 'update',
            entity: 'settings',
            entityId: upserted?.[0]?.id,
            entityName: 'School Settings',
            changes: data,
            performedBy: await getCurrentUsername(),
        });

        return { success: true };
    } catch (error) {
        const err = error as Error;
        return { error: err.message || 'Failed to update settings' };
    }
}
