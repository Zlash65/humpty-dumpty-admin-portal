import { Prisma } from '@prisma/client';
import { getPrisma } from './prisma';

export const psql = Prisma.sql;
export const join = Prisma.join;
export const raw = Prisma.raw;
export const empty = Prisma.empty;

export type PrismaSql = Prisma.Sql;

export async function querySql<T = unknown>(query: PrismaSql): Promise<T> {
    const prisma = getPrisma();
    return (prisma.$queryRaw as any)(query) as Promise<T>;
}

