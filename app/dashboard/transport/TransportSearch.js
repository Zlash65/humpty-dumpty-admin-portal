'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Box, TextField, MenuItem, InputAdornment, IconButton, CircularProgress } from '@mui/material';
import { Search, Clear } from '@mui/icons-material';

export default function TransportSearch({ branches = [], initialSearch = '', initialBranch = '' }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();
    const [search, setSearch] = useState(initialSearch);
    const [branchId, setBranchId] = useState(initialBranch);

    const updateSearch = (newSearch, newBranch) => {
        const params = new URLSearchParams(searchParams);
        if (newSearch) {
            params.set('search', newSearch);
        } else {
            params.delete('search');
        }
        if (newBranch) {
            params.set('branchId', newBranch);
        } else {
            params.delete('branchId');
        }
        startTransition(() => {
            router.push(`/dashboard/transport?${params.toString()}`);
        });
    };

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        updateSearch(search, branchId);
    };

    const clearSearch = () => {
        setSearch('');
        updateSearch('', branchId);
    };

    return (
        <Box component="form" onSubmit={handleSearchSubmit} sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <TextField
                size="small"
                placeholder="Search by driver, route, or vehicle no..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{ minWidth: 300 }}
                slotProps={{
                    input: {
                        startAdornment: (
                            <InputAdornment position="start">
                                {isPending ? <CircularProgress size={20} /> : <Search />}
                            </InputAdornment>
                        ),
                        endAdornment: search && (
                            <InputAdornment position="end">
                                <IconButton size="small" onClick={clearSearch}>
                                    <Clear fontSize="small" />
                                </IconButton>
                            </InputAdornment>
                        )
                    }
                }}
            />
            {branches.length > 0 && (
                <TextField
                    select
                    size="small"
                    value={branchId}
                    onChange={(e) => {
                        setBranchId(e.target.value);
                        updateSearch(search, e.target.value);
                    }}
                    sx={{ minWidth: 180 }}
                    label="Branch"
                >
                    <MenuItem value="">All Branches</MenuItem>
                    {branches.map((branch) => (
                        <MenuItem key={branch._id} value={branch._id}>
                            {branch.name}
                        </MenuItem>
                    ))}
                </TextField>
            )}
        </Box>
    );
}
