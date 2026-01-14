/**
 * Verify migration integrity (SQLite → MongoDB)
 *
 * Usage:
 *   npm run verify:migration
 *
 * Reads `MONGODB_URI` from `.env.local` and/or `.env` (or uses localhost fallback).
 */

import mongoose from 'mongoose';
import { loadEnvFiles } from './load-env';

loadEnvFiles();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/humpty-dumpty-school';

function logKV(key, value) {
    console.log(`${key.padEnd(28)} ${value}`);
}

async function main() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║   Migration Verification                                  ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    const redactedMongoUri = MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/g, '//***:***@');
    console.log(`MongoDB: ${redactedMongoUri}`);

    await mongoose.connect(MONGODB_URI);

    const Branch = mongoose.model('Branch', new mongoose.Schema({}, { strict: false }));
    const AcademicYear = mongoose.model('AcademicYear', new mongoose.Schema({}, { strict: false }));
    const Student = mongoose.model('Student', new mongoose.Schema({}, { strict: false }));
    const StudentEnrollment = mongoose.model('StudentEnrollment', new mongoose.Schema({}, { strict: false }));
    const Staff = mongoose.model('Staff', new mongoose.Schema({}, { strict: false }));
    const Transport = mongoose.model('Transport', new mongoose.Schema({}, { strict: false }));
    const FeeStructure = mongoose.model('FeeStructure', new mongoose.Schema({}, { strict: false }));
    const FeeRecord = mongoose.model('FeeRecord', new mongoose.Schema({}, { strict: false }));
    const ReceiptSequence = mongoose.model('ReceiptSequence', new mongoose.Schema({}, { strict: false }));

    console.log('\n📊 Document counts');
    logKV('branches', await Branch.countDocuments({}));
    logKV('academicYears', await AcademicYear.countDocuments({}));
    logKV('students', await Student.countDocuments({}));
    logKV('enrollments', await StudentEnrollment.countDocuments({}));
    logKV('staff', await Staff.countDocuments({}));
    logKV('transport', await Transport.countDocuments({}));
    logKV('feeStructures', await FeeStructure.countDocuments({}));
    logKV('feeRecords', await FeeRecord.countDocuments({}));
    logKV('receiptSequences', await ReceiptSequence.countDocuments({}));

    console.log('\n🔎 Missing critical fields');
    logKV('students missing branchId', await Student.countDocuments({ $or: [{ branchId: { $exists: false } }, { branchId: null }] }));
    logKV('feeRecords missing branchId', await FeeRecord.countDocuments({ $or: [{ branchId: { $exists: false } }, { branchId: null }] }));
    logKV('feeStructures missing branchId', await FeeStructure.countDocuments({ $or: [{ branchId: { $exists: false } }, { branchId: null }] }));

    console.log('\n🧾 Receipt number checks');
    const dupReceipts = await FeeRecord.aggregate([
        { $unwind: '$transactions' },
        { $match: { 'transactions.receiptNumber': { $type: 'string' } } },
        { $group: { _id: '$transactions.receiptNumber', count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 }
    ]);
    if (dupReceipts.length) {
        console.log('⚠ Duplicate receipt numbers found (showing up to 20):');
        for (const d of dupReceipts) {
            console.log(`- ${d._id}: ${d.count}`);
        }
    } else {
        console.log('✓ No duplicate receipt numbers detected');
    }

    const maxByPrefix = await FeeRecord.aggregate([
        { $unwind: '$transactions' },
        { $match: { 'transactions.receiptNumber': { $regex: /^[CB]-\d+$/ } } },
        {
            $project: {
                prefix: { $substrBytes: ['$transactions.receiptNumber', 0, 1] },
                num: {
                    $toInt: {
                        $arrayElemAt: [{ $split: ['$transactions.receiptNumber', '-'] }, 1]
                    }
                }
            }
        },
        { $group: { _id: '$prefix', max: { $max: '$num' } } },
        { $sort: { _id: 1 } }
    ]);

    const seqDocs = await ReceiptSequence.find({}).lean();
    const seqMap = new Map(seqDocs.map((d) => [String(d.prefix), d]));

    for (const row of maxByPrefix) {
        const prefix = row._id;
        const max = row.max;
        const seq = seqMap.get(prefix);
        const lastNumber = seq?.lastNumber ?? null;
        console.log(`- ${prefix}: max receipt in transactions=${max}, ReceiptSequence.lastNumber=${lastNumber}`);
    }

    await mongoose.disconnect();
    console.log('\n✅ Verification complete');
}

main().catch((err) => {
    console.error('Verification failed:', err);
    process.exitCode = 1;
});
