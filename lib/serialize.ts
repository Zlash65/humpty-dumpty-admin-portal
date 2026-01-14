import { Types } from 'mongoose';

interface ObjectWithId {
    _id?: unknown;
    _bsontype?: string;
    toString(): string;
}

interface DateOnlyOptions {
    dateOnly?: boolean;
}

export function idToString(value: unknown, seen: Set<unknown> | undefined = undefined): string | null {
    if (value === null || value === undefined) return null;

    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);

    if (typeof value !== 'object') return null;

    // Cycle protection (defensive: prevents infinite recursion on malformed objects)
    if (!seen) seen = new Set();
    if (seen.has(value)) return null;
    seen.add(value);

    const objValue = value as ObjectWithId;

    // BSON ObjectId (Mongo / Mongoose)
    if (objValue?._bsontype === 'ObjectId' && typeof objValue.toString === 'function') {
        return objValue.toString();
    }

    // Populated reference object (doc-like). Use own property to avoid weird prototype chains.
    if (Object.prototype.hasOwnProperty.call(objValue, '_id')) {
        const inner = objValue._id;
        if (inner !== value) {
            const innerStr = idToString(inner, seen);
            if (innerStr) return innerStr;
        }
    }

    if (typeof objValue.toString === 'function') {
        const s = objValue.toString();
        if (s && s !== '[object Object]') return s;
    }

    return null;
}

export function dateToISOString(value: Date | string | null | undefined, { dateOnly = false }: DateOnlyOptions = {}): string | undefined {
    if (!value) return undefined;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return undefined;
    const iso = d.toISOString();
    return dateOnly ? iso.split('T')[0] : iso;
}

export function pickRefName<T extends object>(value: T | null | undefined, field: keyof T = 'name' as keyof T): string | null {
    if (!value || typeof value !== 'object') return null;
    const v = value[field];
    return typeof v === 'string' ? v : null;
}
