'use server';

import dbConnect from '@/lib/db';
import FeeRecord from '@/models/FeeRecord';
import StudentEnrollment from '@/models/StudentEnrollment';
import AcademicYear from '@/models/AcademicYear';
import type { IFeeRecordDocument, IAcademicYearDocument } from '@/types';
import type { Types } from 'mongoose';

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

interface FeeHead {
    amount?: number;
    paid?: number;
    status?: string;
}

interface FeeHeads {
    term1?: FeeHead;
    term2?: FeeHead;
    bookFee?: FeeHead;
}

interface Transaction {
    date?: Date;
    amount?: number;
}

interface FeeRecordLean {
    _id: Types.ObjectId;
    fees?: FeeHeads;
    transactions?: Transaction[];
    studentId?: {
        firstName?: string;
        lastName?: string;
        admissionNumber?: string;
    };
}

interface AcademicYearLean {
    _id: Types.ObjectId;
    name?: string;
    startDate?: Date;
    endDate?: Date;
    isActive?: boolean;
}

/**
 * Get monthly fee collection data for the active academic year (last 6 months)
 */
export async function getMonthlyCollectionData(): Promise<MonthlyCollectionData[]> {
    await dbConnect();

    const activeYear = await AcademicYear.findOne({ isActive: true }).lean() as AcademicYearLean | null;
    if (!activeYear) return [];

    const records = await FeeRecord.find({
        academicYearId: activeYear._id,
        'transactions.0': { $exists: true }
    }).lean() as FeeRecordLean[];

    const monthlyData: Record<string, MonthlyCollectionData> = {};
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        monthlyData[monthKey] = { month: monthKey, amount: 0 };
    }

    records.forEach(record => {
        record.transactions?.forEach(tx => {
            if (tx.date && tx.amount) {
                const txDate = new Date(tx.date);
                const monthKey = txDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                if (monthlyData[monthKey]) {
                    monthlyData[monthKey].amount += tx.amount;
                }
            }
        });
    });

    return Object.values(monthlyData);
}

/**
 * Get enrollment count by class for the active academic year
 */
export async function getEnrollmentByClass(): Promise<EnrollmentByClass[]> {
    await dbConnect();

    const activeYear = await AcademicYear.findOne({ isActive: true }).lean() as AcademicYearLean | null;
    if (!activeYear) return [];

    interface AggregateResult {
        _id: string | null;
        count: number;
    }

    const result = await StudentEnrollment.aggregate<AggregateResult>([
        { $match: { academicYearId: activeYear._id } },
        { $group: { _id: '$class', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
    ]);

    return result.map(item => ({
        className: item._id || 'Unknown',
        count: item.count
    }));
}

/**
 * Get fee collection rate (paid vs pending) for the active academic year
 */
export async function getFeeCollectionRate(): Promise<CollectionRateData[]> {
    await dbConnect();

    const activeYear = await AcademicYear.findOne({ isActive: true }).lean() as AcademicYearLean | null;
    if (!activeYear) return [{ name: 'Paid', value: 0 }, { name: 'Pending', value: 0 }];

    interface AggregateResult {
        _id: null;
        totalDue: number;
        totalPaid: number;
    }

    const result = await FeeRecord.aggregate<AggregateResult>([
        { $match: { academicYearId: activeYear._id } },
        {
            $project: {
                totalDue: {
                    $add: [
                        '$fees.term1.amount',
                        '$fees.term2.amount',
                        '$fees.bookFee.amount'
                    ]
                },
                totalPaid: {
                    $add: [
                        '$fees.term1.paid',
                        '$fees.term2.paid',
                        '$fees.bookFee.paid'
                    ]
                }
            }
        },
        {
            $group: {
                _id: null,
                totalDue: { $sum: '$totalDue' },
                totalPaid: { $sum: '$totalPaid' }
            }
        }
    ]);

    if (!result.length) return [{ name: 'No Data', value: 1 }];

    const { totalDue, totalPaid } = result[0];
    const pending = totalDue - totalPaid;

    return [
        { name: 'Collected', value: totalPaid || 0 },
        { name: 'Pending', value: pending || 0 }
    ];
}

/**
 * Get alerts for dashboard (overdue fees, low collection, etc.)
 */
export async function getDashboardAlerts(): Promise<DashboardAlert[]> {
    await dbConnect();

    const activeYear = await AcademicYear.findOne({ isActive: true }).lean() as AcademicYearLean | null;
    if (!activeYear) return [];

    const alerts: DashboardAlert[] = [];

    const overdueRecords = await FeeRecord.find({
        academicYearId: activeYear._id,
        $or: [
            { 'fees.term1.status': { $in: ['Pending', 'Partial'] } },
            { 'fees.term2.status': { $in: ['Pending', 'Partial'] } },
            { 'fees.bookFee.status': { $in: ['Pending', 'Partial'] } }
        ]
    })
    .populate('studentId', 'firstName lastName admissionNumber')
    .lean() as FeeRecordLean[];

    const overdueCount = overdueRecords.filter(r => {
        const totalDue = (r.fees?.term1?.amount || 0) + (r.fees?.term2?.amount || 0) + (r.fees?.bookFee?.amount || 0);
        const totalPaid = (r.fees?.term1?.paid || 0) + (r.fees?.term2?.paid || 0) + (r.fees?.bookFee?.paid || 0);
        return totalDue > totalPaid;
    }).length;

    if (overdueCount > 0) {
        alerts.push({
            type: 'warning',
            title: 'Pending Fee Collection',
            message: `${overdueCount} student${overdueCount > 1 ? 's have' : ' has'} pending fees`,
            link: '/dashboard/fees'
        });
    }

    interface CollectionAggregateResult {
        _id: null;
        totalDue: number;
        totalPaid: number;
    }

    const result = await FeeRecord.aggregate<CollectionAggregateResult>([
        { $match: { academicYearId: activeYear._id } },
        {
            $project: {
                totalDue: {
                    $add: [
                        { $ifNull: ['$fees.term1.amount', 0] },
                        { $ifNull: ['$fees.term2.amount', 0] },
                        { $ifNull: ['$fees.bookFee.amount', 0] }
                    ]
                },
                totalPaid: {
                    $add: [
                        { $ifNull: ['$fees.term1.paid', 0] },
                        { $ifNull: ['$fees.term2.paid', 0] },
                        { $ifNull: ['$fees.bookFee.paid', 0] }
                    ]
                }
            }
        },
        {
            $group: {
                _id: null,
                totalDue: { $sum: '$totalDue' },
                totalPaid: { $sum: '$totalPaid' }
            }
        }
    ]);

    if (result.length > 0) {
        const { totalDue, totalPaid } = result[0];
        const collectionRate = totalDue > 0 ? (totalPaid / totalDue) * 100 : 0;

        if (collectionRate < 50 && totalDue > 0) {
            alerts.push({
                type: 'error',
                title: 'Low Collection Rate',
                message: `Fee collection rate is ${collectionRate.toFixed(1)}%`,
                link: '/dashboard/fees'
            });
        }
    }

    return alerts;
}
