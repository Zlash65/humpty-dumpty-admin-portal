import { PrismaClient } from '@prisma/client';

declare global {
    var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
    const url = process.env.DATABASE_URL;
    if (!url) {
        throw new Error('DATABASE_URL is not set. Set it in .env/.env.local or your deployment environment.');
    }

    // Provider-agnostic Postgres connection (works with any Postgres URL).
    // Prisma uses `DATABASE_URL` from the environment; we validate it's set above
    // to provide a clearer error for local scripts and server actions.
    return new PrismaClient();
}

export function getPrisma(): PrismaClient {
    if (!global.__prisma) {
        global.__prisma = createPrismaClient();
    }
    return global.__prisma;
}
