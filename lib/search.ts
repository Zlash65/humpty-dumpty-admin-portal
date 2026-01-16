export function normalizeLooseSearch(value: unknown): string | null {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return null;
    const deaccented = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const normalized = deaccented.replace(/[^a-z0-9]+/g, '');
    return normalized ? normalized : null;
}

export function normalizeLooseText(value: unknown): string {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return '';
    const deaccented = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return deaccented.replace(/[^a-z0-9]+/g, '');
}

export function splitSearchTokens(value: unknown, maxTokens: number = 5): string[] {
    const raw = String(value ?? '').trim();
    if (!raw) return [];
    const tokens = raw.split(/\s+/).map((t) => t.trim()).filter(Boolean);
    if (!Number.isFinite(maxTokens) || maxTokens <= 0) return tokens;
    return tokens.slice(0, maxTokens);
}
