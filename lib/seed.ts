import bcrypt from 'bcryptjs';
import { sql } from '@/lib/sql';

export async function seedAdmin(): Promise<void> {
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const forceUpdate = process.env.ADMIN_PASSWORD_FORCE_UPDATE === '1';

    if (!adminUsername || !adminPassword) {
        return;
    }

    try {
        const existing = await sql<
            Array<{ id: string; username: string; password: string }>
        >`SELECT id, username, password FROM users WHERE username = ${adminUsername} LIMIT 1`;

        if (!existing?.length) {
            const hashedPassword = await bcrypt.hash(adminPassword, 10);
            await sql`INSERT INTO users (username, password) VALUES (${adminUsername}, ${hashedPassword})`;
        } else {
            if (forceUpdate) {
                const isMatch = await bcrypt.compare(adminPassword, existing[0].password);
                if (!isMatch) {
                    const nextHash = await bcrypt.hash(adminPassword, 10);
                    await sql`UPDATE users SET password = ${nextHash}, updated_at = NOW() WHERE id = ${existing[0].id}`;
                }
            }
        }
    } catch {
        // Seeding failed silently
    }
}
