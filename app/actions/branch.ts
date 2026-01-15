'use server';

import dbConnect from '@/lib/db';
import { dateToISOString } from '@/lib/serialize';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/sql';

// Types for action results
interface ActionResult<T = unknown> {
    success?: boolean;
    error?: string;
    branch?: T;
}

interface SerializedBranch {
    _id: string;
    name?: string;
    code?: string;
    address?: string;
    contact?: string;
    email?: string;
    isActive?: boolean;
    createdAt: string | undefined;
    updatedAt: string | undefined;
}

export async function createBranch(formData: FormData): Promise<ActionResult> {
    const data = {
        name: formData.get('name') as string | null,
        code: (formData.get('code') as string | null) || undefined,
        address: (formData.get('address') as string | null) || undefined,
        contact: (formData.get('contact') as string | null) || undefined,
        email: (formData.get('email') as string | null) || undefined,
    };

    if (!data.name) {
        return { error: 'Branch name is required' };
    }

    try {
        await dbConnect();

        // Check for duplicate name
        const existing = await sql<Array<{ id: string }>>`
            SELECT id FROM branches WHERE name = ${data.name} LIMIT 1
        `;
        if (existing?.length) {
            return { error: 'Branch with this name already exists' };
        }

        const created = await sql<Array<{
            id: string;
            name: string;
            code: string | null;
            address: string | null;
            contact: string | null;
            email: string | null;
            is_active: boolean;
            created_at: string;
            updated_at: string;
        }>>`
            INSERT INTO branches (name, code, address, contact, email)
            VALUES (${data.name}, ${data.code || null}, ${data.address || null}, ${data.contact || null}, ${data.email || null})
            RETURNING id, name, code, address, contact, email, is_active, created_at, updated_at
        `;
        const branch = created?.[0];
        revalidatePath('/dashboard/branches');
        revalidatePath('/dashboard/students');
        return { success: true, branch };
    } catch (error) {
        const err = error as Error;
        const msg = String((err as any)?.message || 'Failed to create branch');
        if (msg.toLowerCase().includes('unique') && msg.toLowerCase().includes('code')) {
            return { error: 'Branch code already exists' };
        }
        if (msg.toLowerCase().includes('unique') && msg.toLowerCase().includes('name')) {
            return { error: 'Branch with this name already exists' };
        }
        return { error: msg };
    }
}

export async function getBranches(includeInactive: boolean = false): Promise<SerializedBranch[]> {
    await dbConnect();

    const rows = await sql<Array<{
        id: string;
        name: string;
        code: string | null;
        address: string | null;
        contact: string | null;
        email: string | null;
        is_active: boolean;
        created_at: string;
        updated_at: string;
    }>>`
        SELECT id, name, code, address, contact, email, is_active, created_at, updated_at
        FROM branches
        WHERE (${includeInactive}::boolean = true OR is_active = true)
        ORDER BY name ASC
    `;

    return rows.map((b) => ({
        _id: b.id,
        name: b.name,
        code: b.code || undefined,
        address: b.address || undefined,
        contact: b.contact || undefined,
        email: b.email || undefined,
        isActive: b.is_active,
        createdAt: dateToISOString(b.created_at),
        updatedAt: dateToISOString(b.updated_at),
    }));
}

export async function getBranchById(id: string): Promise<SerializedBranch | null> {
    await dbConnect();

    const rows = await sql<Array<{
        id: string;
        name: string;
        code: string | null;
        address: string | null;
        contact: string | null;
        email: string | null;
        is_active: boolean;
        created_at: string;
        updated_at: string;
    }>>`
        SELECT id, name, code, address, contact, email, is_active, created_at, updated_at
        FROM branches
        WHERE id = ${id}::uuid
        LIMIT 1
    `;
    const b = rows?.[0];
    if (!b) {
        return null;
    }
    return {
        _id: b.id,
        name: b.name,
        code: b.code || undefined,
        address: b.address || undefined,
        contact: b.contact || undefined,
        email: b.email || undefined,
        isActive: b.is_active,
        createdAt: dateToISOString(b.created_at),
        updatedAt: dateToISOString(b.updated_at),
    };
}

export async function updateBranch(id: string, formData: FormData): Promise<ActionResult> {
    await dbConnect();

    const data: Record<string, string | undefined> = {};
    const fields = ['name', 'code', 'address', 'contact', 'email'];

    fields.forEach(field => {
        const value = formData.get(field) as string | null;
        if (value !== null && value !== undefined) {
            data[field] = value || undefined;
        }
    });

    try {
        const hasCode = Object.prototype.hasOwnProperty.call(data, 'code');
        const hasAddress = Object.prototype.hasOwnProperty.call(data, 'address');
        const hasContact = Object.prototype.hasOwnProperty.call(data, 'contact');
        const hasEmail = Object.prototype.hasOwnProperty.call(data, 'email');

        const updated = await sql<Array<{ id: string }>>`
            UPDATE branches
            SET
                name = COALESCE(${data.name || null}, name),
                code = CASE WHEN ${hasCode}::boolean THEN ${data.code ?? null} ELSE code END,
                address = CASE WHEN ${hasAddress}::boolean THEN ${data.address ?? null} ELSE address END,
                contact = CASE WHEN ${hasContact}::boolean THEN ${data.contact ?? null} ELSE contact END,
                email = CASE WHEN ${hasEmail}::boolean THEN ${data.email ?? null} ELSE email END,
                updated_at = NOW()
            WHERE id = ${id}::uuid
            RETURNING id
        `;
        if (!updated?.length) {
            return { error: 'Branch not found' };
        }
        revalidatePath('/dashboard/branches');
        revalidatePath('/dashboard/students');
        return { success: true };
    } catch (error) {
        const err = error as Error;
        const msg = String((err as any)?.message || 'Failed to update branch');
        if (msg.toLowerCase().includes('unique')) {
            return { error: 'Branch name or code already exists' };
        }
        return { error: msg };
    }
}

export async function deleteBranch(id: string): Promise<ActionResult> {
    await dbConnect();

    try {
        const updated = await sql<Array<{ id: string }>>`
            UPDATE branches
            SET is_active = false, updated_at = NOW()
            WHERE id = ${id}::uuid
            RETURNING id
        `;
        if (!updated?.length) {
            return { error: 'Branch not found' };
        }
        revalidatePath('/dashboard/branches');
        return { success: true };
    } catch (error) {
        const err = error as Error;
        return { error: err.message || 'Failed to delete branch' };
    }
}

export async function getBranchCount(): Promise<number> {
    await dbConnect();
    const rows = await sql<Array<{ total: number }>>`
        SELECT COUNT(*)::int AS total
        FROM branches
        WHERE is_active = true
    `;
    return rows?.[0]?.total || 0;
}
