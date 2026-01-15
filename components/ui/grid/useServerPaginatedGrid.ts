'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GridFilterModel, GridPaginationModel, GridSortModel } from '@mui/x-data-grid';
import useDebouncedValue from '@/components/ui/search/useDebouncedValue';

export interface ServerGridFetchParams {
    page: number; // 0-indexed
    pageSize: number;
    search: string;
    sortModel: GridSortModel;
    filterModel: GridFilterModel;
}

export interface ServerGridFetchResult<R> {
    rows: R[];
    total: number;
}

interface UseServerPaginatedGridOptions<R> {
    enabled?: boolean;
    initialRows: R[];
    initialRowCount: number;
    initialPaginationModel?: GridPaginationModel;
    initialSortModel?: GridSortModel;
    initialFilterModel?: GridFilterModel;
    query: string;
    minChars?: number;
    debounceMs?: number;
    fetchPage: (params: ServerGridFetchParams) => Promise<ServerGridFetchResult<R>>;
}

export default function useServerPaginatedGrid<R>({
    enabled = true,
    initialRows,
    initialRowCount,
    initialPaginationModel = { page: 0, pageSize: 25 },
    initialSortModel = [],
    initialFilterModel = { items: [] },
    query,
    minChars = 2,
    debounceMs = 300,
    fetchPage,
}: UseServerPaginatedGridOptions<R>) {
    const trimmedQuery = useMemo(() => String(query || '').trim(), [query]);
    const searchActive = trimmedQuery.length >= minChars;
    const debouncedSearch = useDebouncedValue(searchActive ? trimmedQuery : '', debounceMs);
    const effectiveSearch = searchActive ? debouncedSearch : '';

    const [rows, setRows] = useState<R[]>(initialRows);
    const [rowCount, setRowCount] = useState<number>(initialRowCount);
    const [paginationModel, setPaginationModel] = useState<GridPaginationModel>(initialPaginationModel);
    const [sortModel, setSortModel] = useState<GridSortModel>(initialSortModel);
    const [filterModel, setFilterModel] = useState<GridFilterModel>(initialFilterModel);
    const [loading, setLoading] = useState(false);
    const [refreshNonce, setRefreshNonce] = useState(0);

    const refresh = useCallback(() => setRefreshNonce((n) => n + 1), []);

    // Keep pagination sensible when the search query changes.
    useEffect(() => {
        // Defer state update to avoid triggering cascading renders inside the effect body.
        Promise.resolve().then(() => {
            setPaginationModel((prev) => (prev.page === 0 ? prev : { ...prev, page: 0 }));
        });
    }, [trimmedQuery]);

    const onSortModelChange = useCallback((next: GridSortModel) => {
        setSortModel(next);
        Promise.resolve().then(() => {
            setPaginationModel((prev) => (prev.page === 0 ? prev : { ...prev, page: 0 }));
        });
    }, []);

    const onFilterModelChange = useCallback((next: GridFilterModel) => {
        setFilterModel(next);
        Promise.resolve().then(() => {
            setPaginationModel((prev) => (prev.page === 0 ? prev : { ...prev, page: 0 }));
        });
    }, []);

    // When SSR data updates (e.g., router.refresh), update client state if we're on the initial view.
    useEffect(() => {
        if (paginationModel.page !== initialPaginationModel.page) return;
        if (paginationModel.pageSize !== initialPaginationModel.pageSize) return;
        if (sortModel.length) return;
        if ((filterModel.items || []).length) return;
        if (effectiveSearch) return;
        Promise.resolve().then(() => {
            setRows(initialRows);
            setRowCount(initialRowCount);
        });
    }, [
        effectiveSearch,
        filterModel.items,
        initialPaginationModel.page,
        initialPaginationModel.pageSize,
        initialRowCount,
        initialRows,
        paginationModel.page,
        paginationModel.pageSize,
        sortModel.length,
    ]);

    const requestIdRef = useRef(0);
    const initialKeyRef = useRef<string | null>(null);

    useEffect(() => {
        if (!enabled) return;

        const key = JSON.stringify({
            page: paginationModel.page,
            pageSize: paginationModel.pageSize,
            search: effectiveSearch,
            sortModel,
            filterModel,
            refreshNonce,
        });

        if (initialKeyRef.current === null) {
            initialKeyRef.current = key;
            return;
        }

        const requestId = ++requestIdRef.current;
        let cancelled = false;
        void (async () => {
            setLoading(true);
            try {
                const res = await fetchPage({
                    page: paginationModel.page,
                    pageSize: paginationModel.pageSize,
                    search: effectiveSearch,
                    sortModel,
                    filterModel,
                });
                if (cancelled) return;
                if (requestIdRef.current !== requestId) return;

                const nextRows = Array.isArray(res?.rows) ? res.rows : [];
                const nextTotal = Number(res?.total) || 0;
                setRows(nextRows);
                setRowCount(nextTotal);

                const maxPage = Math.max(0, Math.ceil(nextTotal / Math.max(1, paginationModel.pageSize)) - 1);
                if (paginationModel.page > maxPage) {
                    setPaginationModel((prev) => ({ ...prev, page: maxPage }));
                }
            } catch {
                if (cancelled) return;
                if (requestIdRef.current !== requestId) return;
                setRows([]);
                setRowCount(0);
            } finally {
                if (cancelled) return;
                if (requestIdRef.current !== requestId) return;
                setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [enabled, effectiveSearch, fetchPage, filterModel, paginationModel.page, paginationModel.pageSize, refreshNonce, sortModel]);

    return {
        rows,
        rowCount,
        paginationModel,
        setPaginationModel,
        sortModel,
        onSortModelChange,
        filterModel,
        onFilterModelChange,
        loading,
        searchActive,
        effectiveSearch,
        refresh,
    };
}
