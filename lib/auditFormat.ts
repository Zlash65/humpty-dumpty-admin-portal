export interface AuditChangeRow {
    field: string;
    old: string;
    new: string;
    kind: 'diff' | 'value';
}

function normalizeEmptyLike(value: unknown): unknown {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string' && value === '') return null;
    return value;
}

function valuesEquivalent(a: unknown, b: unknown): boolean {
    const na = normalizeEmptyLike(a);
    const nb = normalizeEmptyLike(b);
    try {
        return JSON.stringify(na) === JSON.stringify(nb);
    } catch {
        return na === nb;
    }
}

export function auditDisplayValue(value: unknown): string {
    const v = normalizeEmptyLike(value);
    if (v === null) return '-';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    try {
        return JSON.stringify(v);
    } catch {
        return String(v);
    }
}

function isChangeValue(value: unknown): value is { old?: unknown; new?: unknown } {
    if (!value || typeof value !== 'object') return false;
    return Object.prototype.hasOwnProperty.call(value, 'old') || Object.prototype.hasOwnProperty.call(value, 'new');
}

export function auditExtractChangeRows(changes: unknown): AuditChangeRow[] {
    if (!changes || typeof changes !== 'object') return [];

    const entries = Object.entries(changes as Record<string, unknown>);
    const rows: AuditChangeRow[] = [];

    for (const [field, value] of entries) {
        if (isChangeValue(value)) {
            if (valuesEquivalent(value.old, value.new)) continue;
            rows.push({
                field,
                kind: 'diff',
                old: auditDisplayValue(value.old),
                new: auditDisplayValue(value.new),
            });
            continue;
        }

        // Snapshot-style logs: only show meaningful values (skip empty/undefined/null/'').
        if (normalizeEmptyLike(value) === null) continue;
        rows.push({
            field,
            kind: 'value',
            old: '-',
            new: auditDisplayValue(value),
        });
    }

    return rows;
}

export function auditFormatChangesInline(changes: unknown, { maxFields = 20 }: { maxFields?: number } = {}): string {
    const rows = auditExtractChangeRows(changes);
    if (!rows.length) return '';

    const parts = rows.slice(0, maxFields).map((r) => {
        if (r.kind === 'value') return `${r.field}: ${r.new}`;
        return `${r.field}: ${r.old} -> ${r.new}`;
    });

    if (rows.length > maxFields) parts.push('...');
    return parts.join('; ');
}
