'use server';

import dbConnect from '@/lib/db';
import Settings from '@/models/Settings';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { getCurrentUsername } from '@/lib/currentUser';
import type { ISettingsDocument } from '@/types';
import type { Types } from 'mongoose';

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

    interface SettingsLean {
        _id?: Types.ObjectId;
        schoolName?: string;
        schoolTagline?: string;
        address?: string;
        phone?: string;
        phone2?: string;
        phone3?: string;
        email?: string;
        logoUrl?: string;
    }

    let settings = await Settings.findOne().lean() as SettingsLean | null;

    if (!settings) {
        const created = await Settings.create(defaultSettings);
        settings = created.toObject() as SettingsLean;
    }

    return {
        _id: settings._id?.toString(),
        schoolName: settings.schoolName || defaultSettings.schoolName,
        schoolTagline: settings.schoolTagline || defaultSettings.schoolTagline,
        address: settings.address || '',
        phone: settings.phone || '',
        phone2: settings.phone2 || '',
        phone3: settings.phone3 || '',
        email: settings.email || '',
        logoUrl: settings.logoUrl || '',
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
        let settings = await Settings.findOne() as ISettingsDocument | null;

        if (settings) {
            Object.assign(settings, data);
            await settings.save();
        } else {
            settings = await Settings.create(data);
        }

        revalidatePath('/dashboard');
        revalidatePath('/dashboard/settings');
        revalidatePath('/');

        await logAudit({
            action: 'update',
            entity: 'settings',
            entityId: settings?._id,
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
