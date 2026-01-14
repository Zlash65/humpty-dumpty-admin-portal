'use client';

import { Box, Pagination as MuiPagination, Typography, Select, MenuItem, FormControl } from '@mui/material';

export default function Pagination({
    page,
    totalPages,
    totalItems,
    onPageChange,
    itemsPerPage = 25,
    onItemsPerPageChange,
    showItemsPerPage = true
}) {
    const handlePageChange = (event, value) => {
        onPageChange(value);
    };

    const handleItemsPerPageChange = (event) => {
        if (onItemsPerPageChange) {
            onItemsPerPageChange(event.target.value);
        }
    };

    if (totalPages <= 1 && !showItemsPerPage) return null;

    const startItem = (page - 1) * itemsPerPage + 1;
    const endItem = Math.min(page * itemsPerPage, totalItems);

    return (
        <Box
            sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                mt: 3,
                pt: 2,
                borderTop: '1px solid #e2e8f0',
                flexWrap: 'wrap',
                gap: 2,
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant="body2" sx={{ color: '#64748b' }}>
                    Showing {startItem}-{endItem} of {totalItems} items
                </Typography>
                {showItemsPerPage && onItemsPerPageChange && (
                    <FormControl size="small" sx={{ minWidth: 80 }}>
                        <Select
                            value={itemsPerPage}
                            onChange={handleItemsPerPageChange}
                            sx={{
                                fontSize: 13,
                                '& .MuiSelect-select': { py: 0.75 }
                            }}
                        >
                            <MenuItem value={10}>10</MenuItem>
                            <MenuItem value={25}>25</MenuItem>
                            <MenuItem value={50}>50</MenuItem>
                            <MenuItem value={100}>100</MenuItem>
                        </Select>
                    </FormControl>
                )}
            </Box>
            {totalPages > 1 && (
                <MuiPagination
                    count={totalPages}
                    page={page}
                    onChange={handlePageChange}
                    color="primary"
                    shape="rounded"
                    sx={{
                        '& .MuiPaginationItem-root': {
                            '&.Mui-selected': {
                                bgcolor: '#4f46e5',
                                '&:hover': { bgcolor: '#4338ca' }
                            }
                        }
                    }}
                />
            )}
        </Box>
    );
}
