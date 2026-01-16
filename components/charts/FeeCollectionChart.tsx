'use client';

import { Paper, Typography, Box } from '@mui/material';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';

interface FeeCollectionDataPoint {
    month: string;
    amount: number;
}

interface FeeCollectionChartProps {
    data: FeeCollectionDataPoint[];
}

interface TooltipPayloadEntry {
    value?: number;
}

interface CustomTooltipProps {
    active?: boolean;
    payload?: TooltipPayloadEntry[];
    label?: string;
}

const formatCurrency = (value: number): string => {
    if (value >= 100000) {
        return `${(value / 100000).toFixed(1)}L`;
    } else if (value >= 1000) {
        return `${(value / 1000).toFixed(0)}K`;
    }
    return String(value);
};

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
        return (
            <Box
                sx={{
                    bgcolor: 'white',
                    p: 1.5,
                    border: '1px solid #e2e8f0',
                    borderRadius: 1,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                }}
            >
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#1e293b' }}>
                    {label}
                </Typography>
                <Typography variant="body2" sx={{ color: '#4f46e5' }}>
                    Collection: {new Intl.NumberFormat('en-IN', {
                        style: 'currency',
                        currency: 'INR',
                        maximumFractionDigits: 0
                    }).format(payload[0].value as number)}
                </Typography>
            </Box>
        );
    }
    return null;
};

export default function FeeCollectionChart({ data }: FeeCollectionChartProps) {
    const hasData = data && data.length > 0 && data.some(d => d.amount > 0);

    return (
        <Paper sx={{ p: 3, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', height: '100%' }}>
            <Typography
                variant="h6"
                sx={{
                    fontWeight: 600,
                    fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
                    color: '#1e293b',
                    mb: 2,
                }}
            >
                Monthly Fee Collection
            </Typography>

            {hasData ? (
                <ResponsiveContainer width="100%" height={280} initialDimension={{ width: 520, height: 280 }}>
                    <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis
                            dataKey="month"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#64748b', fontSize: 12 }}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#64748b', fontSize: 12 }}
                            tickFormatter={formatCurrency}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f1f5f9' }} />
                        <Bar
                            dataKey="amount"
                            fill="#4f46e5"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={50}
                        />
                    </BarChart>
                </ResponsiveContainer>
            ) : (
                <Box
                    sx={{
                        height: 280,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: '#f8fafc',
                        borderRadius: 2,
                    }}
                >
                    <Typography variant="body2" sx={{ color: '#64748b' }}>
                        No collection data available
                    </Typography>
                </Box>
            )}
        </Paper>
    );
}
