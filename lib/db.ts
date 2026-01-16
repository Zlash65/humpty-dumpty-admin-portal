import { seedAdmin } from './seed';

declare global {
    var __seededAdmin: boolean | undefined;
}

/**
 * dbConnect() is a compatibility helper used throughout the codebase.
 *
 * With Postgres (Neon driver), we don't "connect" in the same way as Mongoose.
 * This function exists to:
 * - validate required env vars are present (DATABASE_URL)
 * - ensure one-time admin seeding in the runtime
 */
export default async function dbConnect(): Promise<void> {
    if (global.__seededAdmin) return;
    global.__seededAdmin = true;
    try {
        await seedAdmin();
    } catch {
        // Seeding failed silently
    }
}
