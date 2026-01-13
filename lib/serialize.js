export function idToString(value, seen = undefined) {
    if (value === null || value === undefined) return null;

    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);

    if (typeof value !== 'object') return null;

    // Cycle protection (defensive: prevents infinite recursion on malformed objects)
    if (!seen) seen = new Set();
    if (seen.has(value)) return null;
    seen.add(value);

    // BSON ObjectId (Mongo / Mongoose)
    if (value?._bsontype === 'ObjectId' && typeof value.toString === 'function') {
        return value.toString();
    }

    // Populated reference object (doc-like). Use own property to avoid weird prototype chains.
    if (Object.prototype.hasOwnProperty.call(value, '_id')) {
        const inner = value._id;
        if (inner !== value) {
            const innerStr = idToString(inner, seen);
            if (innerStr) return innerStr;
        }
    }

    if (typeof value.toString === 'function') {
        const s = value.toString();
        if (s && s !== '[object Object]') return s;
    }

    return null;
}

export function dateToISOString(value, { dateOnly = false } = {}) {
    if (!value) return undefined;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return undefined;
    const iso = d.toISOString();
    return dateOnly ? iso.split('T')[0] : iso;
}

export function pickRefName(value, field = 'name') {
    if (!value || typeof value !== 'object') return null;
    const v = value[field];
    return typeof v === 'string' ? v : null;
}
