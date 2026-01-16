'use client';

import { Paper, Typography, Box } from '@mui/material';
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Legend,
    Tooltip
} from 'recharts';
interface EnrollmentDataPoint {
    className: string;
    count: number;
    [key: string]: string | number;
}

interface EnrollmentChartProps {
    data: EnrollmentDataPoint[];
}

interface TooltipPayloadEntry {
    value?: number;
    payload?: EnrollmentDataPoint;
}

interface CustomTooltipProps {
    active?: boolean;
    payload?: TooltipPayloadEntry[];
}

interface LegendEntry {
    payload?: EnrollmentDataPoint;
}

const COLORS = ['#4f46e5', '#059669', '#d97706', '#e11d48', '#7c3aed', '#0891b2', '#475569', '#84cc16'];

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload as EnrollmentDataPoint;
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
                    {data.className}
                </Typography>
                <Typography variant="body2" sx={{ color: '#4f46e5' }}>
                    Students: {payload[0].value}
                </Typography>
            </Box>
        );
    }
    return null;
};

export default function EnrollmentChart({ data }: EnrollmentChartProps) {
    const hasData = data && data.length > 0;
    const total = hasData ? data.reduce((sum, item) => sum + item.count, 0) : 0;

    return (
        <Paper sx={{ p: 3, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', height: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography
                    variant="h6"
                    sx={{
                        fontWeight: 600,
                        fontFamily: 'var(--font-nunito), "Nunito", sans-serif',
                        color: '#1e293b',
                    }}
                >
                    Enrollment by Class
                </Typography>
                {hasData && (
                    <Typography variant="body2" sx={{ color: '#64748b' }}>
                        Total: {total}
                    </Typography>
                )}
            </Box>

            {hasData ? (
                <ResponsiveContainer width="100%" height={280} initialDimension={{ width: 520, height: 280 }}>
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="45%"
                            innerRadius={50}
                            outerRadius={90}
                            paddingAngle={2}
                            dataKey="count"
                            nameKey="className"
                        >
                            {data.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                        <Legend
                            layout="horizontal"
                            verticalAlign="bottom"
                            align="center"
                            wrapperStyle={{ paddingTop: 10 }}
                            formatter={(_value: string, entry: unknown) => (
                                <span style={{ color: '#64748b', fontSize: 12 }}>
                                    {((entry as LegendEntry).payload as EnrollmentDataPoint)?.className || ''}
                                </span>
                            )}
                        />
                    </PieChart>
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
                        No enrollment data available
                    </Typography>
                </Box>
            )}
        </Paper>
    );
}
