'use server';

import dbConnect from '@/lib/db';
import { sql } from '@/lib/sql';

interface MonthlyCollectionData {
    month: string;
    amount: number;
}

interface EnrollmentByClass {
    className: string;
    count: number;
}

interface CollectionRateData {
    name: string;
    value: number;
}

interface DashboardAlert {
    type: 'warning' | 'error' | 'info';
    title: string;
    message: string;
    link: string;
}

async function getActiveYearId(): Promise<string | null> {
    const rows = await sql<Array<{ id: string }>>`
        SELECT id
        FROM academic_years
        WHERE is_active = true
        ORDER BY start_date DESC
        LIMIT 1
    `;
    return rows?.[0]?.id || null;
}

/**
 * Get monthly fee collection data for the active academic year (last 6 months)
 */
export async function getMonthlyCollectionData(): Promise<MonthlyCollectionData[]> {
    await dbConnect();
    const activeYearId = await getActiveYearId();
    if (!activeYearId) return [];

    const now = new Date();
    const startWindow = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const tx = await sql<Array<{ date: string; amount: string }>>`
        SELECT tx.date, tx.amount
        FROM fee_transactions tx
        JOIN fee_records fr ON fr.id = tx.fee_record_id
        WHERE fr.academic_year_id = ${activeYearId}::uuid
          AND tx.date >= ${startWindow.toISOString()}::timestamptz
    `;

    const monthlyData: Record<string, MonthlyCollectionData> = {};
    for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        monthlyData[monthKey] = { month: monthKey, amount: 0 };
    }

    for (const row of tx) {
        const txDate = new Date(row.date);
        const monthKey = txDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        if (monthlyData[monthKey]) monthlyData[monthKey].amount += Number(row.amount) || 0;
    }

    return Object.values(monthlyData);
}

/**
 * Get enrollment count by class for the active academic year
 */
export async function getEnrollmentByClass(): Promise<EnrollmentByClass[]> {
    await dbConnect();
    const activeYearId = await getActiveYearId();
    if (!activeYearId) return [];

    const rows = await sql<Array<{ class: string; count: number }>>`
        SELECT class, COUNT(*)::int AS count
        FROM student_enrollments
        WHERE academic_year_id = ${activeYearId}::uuid
        GROUP BY class
        ORDER BY class ASC
    `;

    return rows.map((r) => ({ className: r.class || 'Unknown', count: Number(r.count) || 0 }));
}

/**
 * Get fee collection rate (paid vs pending) for the active academic year
 */
export async function getFeeCollectionRate(): Promise<CollectionRateData[]> {
    await dbConnect();
    const activeYearId = await getActiveYearId();
    if (!activeYearId) return [{ name: 'Collected', value: 0 }, { name: 'Pending', value: 0 }];

    const rows = await sql<Array<{ total_due: string | null; total_paid: string | null }>>`
        SELECT
            SUM(term1_amount + term2_amount + book_fee_amount)::numeric AS total_due,
            SUM(term1_paid + term2_paid + book_fee_paid)::numeric AS total_paid
        FROM fee_records
        WHERE academic_year_id = ${activeYearId}::uuid
    `;
    const totalDue = Number(rows?.[0]?.total_due) || 0;
    const totalPaid = Number(rows?.[0]?.total_paid) || 0;
    if (!totalDue && !totalPaid) return [{ name: 'No Data', value: 1 }];

    const pending = Math.max(0, totalDue - totalPaid);
    return [
        { name: 'Collected', value: totalPaid || 0 },
        { name: 'Pending', value: pending || 0 },
    ];
}

/**
 * Get alerts for dashboard (pending fees, low collection, etc.)
 */
export async function getDashboardAlerts(): Promise<DashboardAlert[]> {
    await dbConnect();
    const activeYearId = await getActiveYearId();
    if (!activeYearId) return [];

    const alerts: DashboardAlert[] = [];

    const overdueRows = await sql<Array<{ total: number }>>`
        SELECT COUNT(*)::int AS total
        FROM fee_records
        WHERE academic_year_id = ${activeYearId}::uuid
          AND (term1_amount + term2_amount + book_fee_amount) > (term1_paid + term2_paid + book_fee_paid)
    `;
    const overdueCount = overdueRows?.[0]?.total || 0;
    if (overdueCount > 0) {
        alerts.push({
            type: 'warning',
            title: 'Pending Fee Collection',
            message: `${overdueCount} student${overdueCount > 1 ? 's have' : ' has'} pending fees`,
            link: '/dashboard/fees',
        });
    }

    const totals = await sql<Array<{ total_due: string | null; total_paid: string | null }>>`
        SELECT
            SUM(term1_amount + term2_amount + book_fee_amount)::numeric AS total_due,
            SUM(term1_paid + term2_paid + book_fee_paid)::numeric AS total_paid
        FROM fee_records
        WHERE academic_year_id = ${activeYearId}::uuid
    `;
    const totalDue = Number(totals?.[0]?.total_due) || 0;
    const totalPaid = Number(totals?.[0]?.total_paid) || 0;
    const collectionRate = totalDue > 0 ? (totalPaid / totalDue) * 100 : 0;

    if (totalDue > 0 && collectionRate < 50) {
        alerts.push({
            type: 'error',
            title: 'Low Collection Rate',
            message: `Fee collection rate is ${collectionRate.toFixed(1)}%`,
            link: '/dashboard/fees',
        });
    }

    return alerts;
}
