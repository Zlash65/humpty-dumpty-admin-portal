import dbConnect from './db';
import User from '@/models/User';
import bcrypt from 'bcryptjs';

export async function seedAdmin() {
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminUsername || !adminPassword) {
        console.error('ADMIN_USERNAME or ADMIN_PASSWORD not set in environment variables.');
        return;
    }

    try {
        await dbConnect();
        const existingAdmin = await User.findOne({ username: adminUsername });

        if (!existingAdmin) {
            const hashedPassword = await bcrypt.hash(adminPassword, 10);
            await User.create({
                username: adminUsername,
                password: hashedPassword,
            });
            console.log(`Admin user ${adminUsername} created successfully.`);
        } else {
            console.log('Admin user already exists.');
        }
    } catch (error) {
        console.error('Error seeding admin user:', error);
    }
}
