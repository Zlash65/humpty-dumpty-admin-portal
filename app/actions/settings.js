'use server';

import dbConnect from '@/lib/db';
import Settings from '@/models/Settings';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { getCurrentUsername } from '@/lib/currentUser';

const defaultSettings = {
    schoolName: 'School',
    schoolTagline: 'Where Learning Meets Excellence',
    address: '',
    phone: '',
    phone2: '',
    phone3: '',
    email: '',
    logoUrl: '',
};

export async function getSettings() {
    await dbConnect();

    let settings = await Settings.findOne().lean();

    if (!settings) {
        settings = await Settings.create(defaultSettings);
        settings = settings.toObject();
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

export async function updateSettings(formData) {
    await dbConnect();

    const data = {
        schoolName: formData.get('schoolName') || defaultSettings.schoolName,
        schoolTagline: formData.get('schoolTagline') || defaultSettings.schoolTagline,
        address: formData.get('address') || '',
        phone: formData.get('phone') || '',
        phone2: formData.get('phone2') || '',
        phone3: formData.get('phone3') || '',
        email: formData.get('email') || '',
        logoUrl: formData.get('logoUrl') || '',
    };

    try {
        let settings = await Settings.findOne();

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
            performedBy: getCurrentUsername(),
        });

        return { success: true };
    } catch (error) {
        return { error: error.message || 'Failed to update settings' };
    }
}
