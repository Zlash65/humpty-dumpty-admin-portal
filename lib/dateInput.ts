export function parseDateOnlyInput(value: unknown): string | null {
    const raw = String(value ?? '').trim();
    if (!raw) return null;

    // Accept common inputs:
    // - YYYY-MM-DD
    // - YYYY-MM-DDTHH:mm:ss...
    // - YYYY-MM-DD HH:mm:ss...
    const datePart = raw.split('T')[0].split(' ')[0].trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;

    const [yStr, mStr, dStr] = datePart.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    const d = Number(dStr);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;

    // Validate the date is real (e.g., rejects 2026-02-30).
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y) return null;
    if (dt.getUTCMonth() !== m - 1) return null;
    if (dt.getUTCDate() !== d) return null;

    return datePart;
}

