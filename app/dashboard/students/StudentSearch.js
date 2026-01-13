'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Box, TextField, MenuItem, InputAdornment, IconButton, CircularProgress } from '@mui/material';
import { Search, Clear } from '@mui/icons-material';

export default function StudentSearch({ branches = [], initialSearch = '', initialBranch = '' }) {
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
            router.push(`/dashboard/students?${params.toString()}`);
        });
    };

    const handleSearchChange = (e) => {
        const value = e.target.value;
        setSearch(value);
    };

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        updateSearch(search, branchId);
    };

    const handleBranchChange = (e) => {
        const value = e.target.value;
        setBranchId(value);
        updateSearch(search, value);
    };

    const clearSearch = () => {
        setSearch('');
        updateSearch('', branchId);
    };

    return (
        <Box component="form" onSubmit={handleSearchSubmit} sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <TextField
                size="small"
                placeholder="Search by name or admission no..."
                value={search}
                onChange={handleSearchChange}
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
                    onChange={handleBranchChange}
                    sx={{ minWidth: 180 }}
                    label="Filter by Branch"
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
