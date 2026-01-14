'use client';

import { Box, Skeleton, Paper } from '@mui/material';

export default function TableSkeleton({ rows = 5, columns = 4 }) {
    return (
        <Paper sx={{ border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            {/* Header */}
            <Box sx={{ p: 2, borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 2 }}>
                {Array.from({ length: columns }).map((_, i) => (
                    <Skeleton
                        key={i}
                        variant="text"
                        width={`${100 / columns}%`}
                        height={24}
                    />
                ))}
            </Box>

            {/* Rows */}
            {Array.from({ length: rows }).map((_, rowIndex) => (
                <Box
                    key={rowIndex}
                    sx={{
                        p: 2,
                        borderBottom: rowIndex < rows - 1 ? '1px solid #f1f5f9' : 'none',
                        display: 'flex',
                        gap: 2,
                        alignItems: 'center'
                    }}
                >
                    {Array.from({ length: columns }).map((_, colIndex) => (
                        <Skeleton
                            key={colIndex}
                            variant="text"
                            width={`${100 / columns}%`}
                            height={20}
                        />
                    ))}
                </Box>
            ))}
        </Paper>
    );
}

export function PageHeaderSkeleton() {
    return (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
            <Box>
                <Skeleton variant="text" width={200} height={40} />
                <Skeleton variant="text" width={300} height={20} />
            </Box>
            <Skeleton variant="rectangular" width={120} height={40} sx={{ borderRadius: 1 }} />
        </Box>
    );
}

export function StatCardSkeleton() {
    return (
        <Paper sx={{ p: 3, border: '1px solid #e2e8f0' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Box>
                    <Skeleton variant="text" width={80} height={20} />
                    <Skeleton variant="text" width={60} height={40} />
                </Box>
                <Skeleton variant="circular" width={48} height={48} />
            </Box>
        </Paper>
    );
}

export function DashboardSkeleton() {
    return (
        <Box>
            <PageHeaderSkeleton />

            {/* Stats Grid */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3, mb: 4 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                    <StatCardSkeleton key={i} />
                ))}
            </Box>

            {/* Fee Cards */}
            <Skeleton variant="text" width={200} height={30} sx={{ mb: 2 }} />
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, mb: 4 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} variant="rectangular" height={80} sx={{ borderRadius: 1 }} />
                ))}
            </Box>

            {/* Bottom Grid */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '5fr 7fr', gap: 3 }}>
                <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 1 }} />
                <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 1 }} />
            </Box>
        </Box>
    );
}
