import mongoose from 'mongoose';
import { seedAdmin } from './seed';

// Support both MONGODB_URI (simple) and separate env vars (cloud)
let MONGODB_URI;
if (process.env.MONGODB_URI) {
    MONGODB_URI = process.env.MONGODB_URI;
} else if (process.env.MONGO_DB_HOST) {
    const protocol = process.env.MONGO_DB_PROTOCOL || 'mongodb';
    const host = process.env.MONGO_DB_HOST;
    const dbName = process.env.MONGO_DB_NAME;
    const options = process.env.MONGO_DB_OPTIONS || '';

    const username = process.env.MONGO_DB_USERNAME;
    const password = process.env.MONGO_DB_PASSWORD;

    const auth =
        username && password
            ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
            : '';

    if (!dbName) {
        throw new Error('MONGO_DB_NAME is required when using MONGO_DB_* environment variables');
    }

    MONGODB_URI = `${protocol}://${auth}${host}/${dbName}${options}`;
}

if (!MONGODB_URI) {
    throw new Error(
        'Please define MONGODB_URI or MONGO_DB_* environment variables in your environment, .env.local, or .env'
    );
}

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
let cached = global.mongoose;

if (!cached) {
    cached = global.mongoose = { conn: null, promise: null, seededAdmin: false };
}

async function dbConnect() {
    if (cached.conn) {
        return cached.conn;
    }

    if (!cached.promise) {
        const opts = {
            bufferCommands: false,
        };

        cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
            return mongoose;
        });
    }

    try {
        cached.conn = await cached.promise;
    } catch (e) {
        cached.promise = null;
        throw e;
    }

    // Ensure the admin user exists in production deployments (e.g., Vercel) even if
    // Next.js instrumentation doesn't run for a given runtime mode.
    if (!cached.seededAdmin) {
        cached.seededAdmin = true;
        try {
            await seedAdmin();
        } catch {
            // Admin seed failed silently
        }
    }

    return cached.conn;
}

export default dbConnect;
