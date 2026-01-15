'use client';

import * as React from 'react';
import useDebouncedValue from '@/components/ui/search/useDebouncedValue';

export type UseAsyncSearchParams<T> = {
    query: string;
    minChars?: number;
    debounceMs?: number;
    /**
     * Fetch results for the given query (already trimmed).
     * Called only when query length >= minChars.
     */
    fetcher: (query: string) => Promise<T[]>;
};

export type UseAsyncSearchResult<T> = {
    active: boolean;
    searching: boolean;
    results: T[];
};

export default function useAsyncSearch<T>({ query, minChars = 2, debounceMs = 300, fetcher }: UseAsyncSearchParams<T>): UseAsyncSearchResult<T> {
    const trimmed = String(query || '').trim();
    const active = minChars <= 0 ? trimmed.length > 0 : trimmed.length >= minChars;
    const debounced = useDebouncedValue(trimmed, debounceMs);

    const [results, setResults] = React.useState<T[]>([]);
    const [searching, setSearching] = React.useState(false);

    React.useEffect(() => {
        if (!active) {
            setResults([]);
            setSearching(false);
            return;
        }
        if (debounced !== trimmed) return;

        let mounted = true;
        setSearching(true);
        (async () => {
            try {
                const next = await fetcher(debounced);
                if (!mounted) return;
                setResults(Array.isArray(next) ? next : []);
            } catch {
                if (!mounted) return;
                setResults([]);
            } finally {
                if (mounted) setSearching(false);
            }
        })();

        return () => {
            mounted = false;
        };
    }, [active, debounced, trimmed, fetcher]);

    return { active, searching, results };
}

