'use client';

import * as React from 'react';
import createCache, { EmotionCache, Options as CacheOptions } from '@emotion/cache';
import { useServerInsertedHTML } from 'next/navigation';
import { CacheProvider as EmotionCacheProvider } from '@emotion/react';

interface NextAppDirEmotionCacheProviderProps {
    options: CacheOptions;
    CacheProvider?: React.ComponentType<{ value: EmotionCache; children: React.ReactNode }>;
    children: React.ReactNode;
}

interface CacheState {
    cache: EmotionCache & { compat?: boolean };
    flush: () => string[];
}

export default function NextAppDirEmotionCacheProvider(props: NextAppDirEmotionCacheProviderProps) {
    const { options, CacheProvider = EmotionCacheProvider, children } = props;

    const [{ cache, flush }] = React.useState<CacheState>(() => {
        const cache = createCache(options) as EmotionCache & { compat?: boolean };
        cache.compat = true;
        const prevInsert = cache.insert;
        let inserted: string[] = [];
        cache.insert = (...args) => {
            const serialized = args[1];
            if (cache.inserted[serialized.name] === undefined) {
                inserted.push(serialized.name);
            }
            return prevInsert(...args);
        };
        const flush = (): string[] => {
            const prevInserted = inserted;
            inserted = [];
            return prevInserted;
        };
        return { cache, flush };
    });

    useServerInsertedHTML(() => {
        const names = flush();
        if (names.length === 0) {
            return null;
        }
        let styles = '';
        for (const name of names) {
            styles += cache.inserted[name];
        }
        return (
            <style
                key={cache.key}
                data-emotion={`${cache.key} ${names.join(' ')}`}
                dangerouslySetInnerHTML={{
                    __html: styles,
                }}
            />
        );
    });

    return <CacheProvider value={cache}>{children}</CacheProvider>;
}
