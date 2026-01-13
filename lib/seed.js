import User from '@/models/User';
import bcrypt from 'bcryptjs';

export async function seedAdmin() {
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const forceUpdate = process.env.ADMIN_PASSWORD_FORCE_UPDATE === '1';

    if (!adminUsername || !adminPassword) {
        return;
    }

    try {
        const existingAdmin = await User.findOne({ username: adminUsername });

        if (!existingAdmin) {
            const hashedPassword = await bcrypt.hash(adminPassword, 10);
            await User.create({
                username: adminUsername,
                password: hashedPassword,
            });
        } else {
            if (forceUpdate) {
                const isMatch = await bcrypt.compare(adminPassword, existingAdmin.password);
                if (!isMatch) {
                    existingAdmin.password = await bcrypt.hash(adminPassword, 10);
                    await existingAdmin.save();
                }
            }
        }
    } catch {
        // Seeding failed silently
    }
}
