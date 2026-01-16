/**
 * Shift helpers.
 *
 * Domain:
 * - UI only allows two shifts: Morning and Afternoon.
 * - Legacy DB data sometimes stores "Morning" as an empty string in `shift_name`.
 *   To preserve uniqueness and backwards compatibility, we continue to store:
 *     - Morning   => ''   (empty string)
 *     - Afternoon => 'Afternoon'
 */

export type UiShift = 'Morning' | 'Afternoon';

export const SHIFT_OPTIONS: ReadonlyArray<{ value: UiShift; label: UiShift; keywords: string }> = [
    { value: 'Morning', label: 'Morning', keywords: 'morning am' },
    { value: 'Afternoon', label: 'Afternoon', keywords: 'afternoon pm' },
] as const;

export function parseUiShift(value: unknown): UiShift | null {
    if (value === null || value === undefined) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const lower = raw.toLowerCase();
    if (lower === 'morning') return 'Morning';
    if (lower === 'afternoon') return 'Afternoon';
    return null;
}

export function uiShiftFromDb(dbValue: unknown): UiShift {
    // DB stores morning as '' (or sometimes 'Morning' from legacy/manual inserts).
    const raw = String(dbValue ?? '').trim();
    if (!raw) return 'Morning';
    const parsed = parseUiShift(raw);
    return parsed || 'Morning';
}

export function dbShiftFromUi(value: unknown): '' | 'Afternoon' {
    // Accept legacy empty string as morning.
    const parsed = parseUiShift(value);
    if (!parsed) return '';
    return parsed === 'Afternoon' ? 'Afternoon' : '';
}

