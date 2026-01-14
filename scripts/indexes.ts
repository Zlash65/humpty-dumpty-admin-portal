/**
 * Index management (MongoDB)
 *
 * Usage:
 *   npm run indexes:create     # create missing indexes (safe)
 *   npm run indexes:sync       # drop + recreate indexes to match schemas (destructive)
 *
 * Reads `MONGODB_URI` from `.env.local` and/or `.env` (or uses localhost fallback).
 */

import mongoose from 'mongoose';
import { loadEnvFiles } from './load-env';

import AcademicYear from '../models/AcademicYear';
import Branch from '../models/Branch';
import FeeRecord from '../models/FeeRecord';
import FeeStructure from '../models/FeeStructure';
import ReceiptSequence from '../models/ReceiptSequence';
import Staff from '../models/Staff';
import Student from '../models/Student';
import StudentEnrollment from '../models/StudentEnrollment';
import Transport from '../models/Transport';
import User from '../models/User';

loadEnvFiles();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/humpty-dumpty-school';

function redactMongoUri(uri: string) {
    return String(uri).replace(/\/\/([^:]+):([^@]+)@/g, '//***:***@');
}

async function main() {
    const args = process.argv.slice(2);
    const mode: 'sync' | 'create' = args.includes('--sync') ? 'sync' : 'create';

    console.log(`MongoDB: ${redactMongoUri(MONGODB_URI)}`);
    console.log(`Mode: ${mode === 'sync' ? 'syncIndexes (drop + recreate)' : 'createIndexes (create only)'}`);

    await mongoose.connect(MONGODB_URI);

    const models = [
        Branch,
        AcademicYear,
        Student,
        StudentEnrollment,
        Staff,
        Transport,
        FeeStructure,
        FeeRecord,
        ReceiptSequence,
        User,
    ];

    for (const model of models) {
        const name = model.modelName;
        try {
            if (mode === 'sync') {
                const dropped = await model.syncIndexes();
                const droppedList = Array.isArray(dropped) ? dropped : [];
                console.log(`✓ ${name}: synced (dropped=${droppedList.length})`);
            } else {
                await model.createIndexes();
                console.log(`✓ ${name}: indexes created`);
            }
        } catch (err: any) {
            console.error(`✗ ${name}: ${err?.message || err}`);
            process.exitCode = 1;
        }
    }

    await mongoose.disconnect();
}

main().catch((err: any) => {
    console.error('Index management failed:', err);
    process.exitCode = 1;
});
