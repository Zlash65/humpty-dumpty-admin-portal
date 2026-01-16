export type PaymentType = 'cash' | 'bank' | 'upi';

export const PAYMENT_TYPES: ReadonlyArray<PaymentType> = ['cash', 'bank', 'upi'] as const;

export const PAYMENT_TYPE_OPTIONS: ReadonlyArray<{ value: PaymentType; label: string; keywords: string }> = [
    { value: 'cash', label: 'Cash', keywords: 'cash' },
    { value: 'bank', label: 'Bank', keywords: 'bank transfer cheque check' },
    { value: 'upi', label: 'UPI', keywords: 'upi vpa' },
] as const;

function normalizeToken(value: unknown): string {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ');
}

export function parsePaymentType(value: unknown): PaymentType | null {
    if (value === null || value === undefined) return null;
    const s = normalizeToken(value);
    if (!s) return null;

    // Exact / common variants
    if (s === 'cash') return 'cash';
    if (s === 'upi') return 'upi';
    if (s === 'bank') return 'bank';

    // Also accept Payment Mode-like values (DB stores payment_mode)
    if (s.includes('cash')) return 'cash';
    if (s.includes('upi')) return 'upi';

    // Cheque / bank transfer / other non-cash methods are treated as bank-type in the UI.
    if (s.includes('cheque') || s.includes('check')) return 'bank';
    if (s.includes('bank')) return 'bank';
    if (s.includes('transfer')) return 'bank';
    if (s.includes('online')) return 'bank';

    return null;
}

export function normalizePaymentType(value: unknown, { fallback = 'bank' }: { fallback?: PaymentType } = {}): PaymentType {
    return parsePaymentType(value) || fallback;
}

export function paymentTypeLabel(value: unknown): string {
    const t = parsePaymentType(value);
    if (!t) return String(value ?? '').trim() || '-';
    if (t === 'cash') return 'Cash';
    if (t === 'upi') return 'UPI';
    return 'Bank';
}

