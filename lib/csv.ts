export function csvEscape(value: unknown): string {
    const s = String(value ?? '');
    if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
    const out: string[] = [];
    out.push(headers.map(csvEscape).join(','));
    for (const row of rows) {
        out.push((row || []).map(csvEscape).join(','));
    }
    return `${out.join('\n')}\n`;
}

