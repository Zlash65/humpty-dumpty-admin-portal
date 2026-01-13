'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Box, TextField, MenuItem, InputAdornment, IconButton, CircularProgress } from '@mui/material';
import { Search, Clear } from '@mui/icons-material';

export default function StaffSearch({ branches = [], initialSearch = '', initialBranch = '', initialType = '' }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();
    const [search, setSearch] = useState(initialSearch);
    const [branchId, setBranchId] = useState(initialBranch);
    const [staffType, setStaffType] = useState(initialType);

    const updateSearch = (newSearch, newBranch, newType) => {
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
        if (newType) {
            params.set('staffType', newType);
        } else {
            params.delete('staffType');
        }
        startTransition(() => {
            router.push(`/dashboard/staff?${params.toString()}`);
        });
    };

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        updateSearch(search, branchId, staffType);
    };

    const clearSearch = () => {
        setSearch('');
        updateSearch('', branchId, staffType);
    };

    return (
        <Box component="form" onSubmit={handleSearchSubmit} sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
                size="small"
                placeholder="Search by name, contact, or role..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{ minWidth: 280 }}
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
            <TextField
                select
                size="small"
                value={staffType}
                onChange={(e) => {
                    setStaffType(e.target.value);
                    updateSearch(search, branchId, e.target.value);
                }}
                sx={{ minWidth: 150 }}
                label="Staff Type"
            >
                <MenuItem value="">All Types</MenuItem>
                <MenuItem value="office">Office Staff</MenuItem>
                <MenuItem value="teacher">Teachers</MenuItem>
            </TextField>
            {branches.length > 0 && (
                <TextField
                    select
                    size="small"
                    value={branchId}
                    onChange={(e) => {
                        setBranchId(e.target.value);
                        updateSearch(search, e.target.value, staffType);
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
