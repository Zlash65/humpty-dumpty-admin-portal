export type FeeTerm = 'term1' | 'term2' | 'books';

export const FEE_TERMS: ReadonlyArray<FeeTerm> = ['term1', 'term2', 'books'] as const;

export const FEE_TERM_OPTIONS: ReadonlyArray<{ value: FeeTerm; label: string; keywords: string }> = [
    { value: 'term1', label: 'Term 1', keywords: 'term1 term 1 first t1' },
    { value: 'term2', label: 'Term 2', keywords: 'term2 term 2 second t2' },
    { value: 'books', label: 'Books', keywords: 'books book book fee' },
] as const;

function normalizeToken(value: unknown): string {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ');
}

export function parseFeeTerm(value: unknown): FeeTerm | null {
    if (value === null || value === undefined) return null;
    const s = normalizeToken(value);
    if (!s) return null;

    // Exact / common variants
    if (s === 'term1' || s === 'term 1' || s === 't1' || s === 'term one' || s === 'first term') return 'term1';
    if (s === 'term2' || s === 'term 2' || s === 't2' || s === 'term two' || s === 'second term') return 'term2';
    if (s === 'books' || s === 'book' || s === 'book fee' || s === 'books fee') return 'books';

    // Fuzzy matching (keeps backward compatibility with messy legacy data)
    if (s.includes('term2') || s.includes('term 2') || s.includes('t2') || s.includes('second')) return 'term2';
    if (s.includes('book')) return 'books';
    if (s.includes('term1') || s.includes('term 1') || s.includes('t1') || s.includes('first')) return 'term1';

    return null;
}

export function normalizeFeeTerm(value: unknown, { fallback = 'term1' }: { fallback?: FeeTerm } = {}): FeeTerm {
    return parseFeeTerm(value) || fallback;
}

export function feeTermLabel(value: unknown): string {
    const term = parseFeeTerm(value);
    if (!term) return String(value ?? '').trim() || '-';
    if (term === 'term1') return 'Term 1';
    if (term === 'term2') return 'Term 2';
    return 'Books';
}

export function feeHeadLabel(value: unknown): string {
    const s = normalizeToken(value);
    if (s === 'bookfee' || s === 'book fee') return 'Books';
    return feeTermLabel(s);
}
