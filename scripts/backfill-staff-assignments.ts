/**
 * Backfill Staff.teacher assignments with stable ids (Electron parity)
 *
 * Why:
 * - Some existing MongoDB datasets were migrated before we introduced:
 *   - `assignments[].classEntryId` (FeeStructure _id)
 *   - `assignments[].branchId` (Branch _id)
 * - The Staff UI + teacher-wise report works best when assignments carry these stable ids.
 *
 * What it does:
 * - Finds the active AcademicYear (falls back to latest by startDate).
 * - Builds a lookup map of FeeStructure by (branchId + class + shiftName) for that year.
 * - For every teacher assignment:
 *   - Sets `assignments[].branchId` to the assignment's branchId or the staff.branchId.
 *   - Sets `assignments[].classEntryId` by looking up the FeeStructure for the resolved branchId/class/shift.
 *
 * Safe by default:
 * - Dry-run by default; pass `--apply` to persist changes.
 *
 * Usage:
 *   # Dry-run (no writes)
 *   tsx scripts/backfill-staff-assignments.ts
 *
 *   # Apply (writes to DB)
 *   npm run backfill:staff-assignments
 *   # or: tsx scripts/backfill-staff-assignments.ts --apply
 */

import mongoose from 'mongoose';
import { loadEnvFiles } from './load-env';

loadEnvFiles({ rootDir: process.cwd() });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/humpty-dumpty-school';

function norm(v) {
    return String(v || '').trim();
}

function makeKey({ branchId, className, shiftName }) {
    return `${String(branchId || '')}|||${norm(className).toUpperCase()}|||${norm(shiftName).toUpperCase()}`;
}

async function main() {
    const apply = process.argv.includes('--apply');

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║   Backfill Staff Assignments                              ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    const redactedMongoUri = MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/g, '//***:***@');
    console.log(`MongoDB: ${redactedMongoUri}`);
    console.log(`Mode: ${apply ? 'APPLY (writes to DB)' : 'DRY RUN (no writes)'}`);

    await mongoose.connect(MONGODB_URI);

    const Staff = mongoose.model('Staff', new mongoose.Schema({}, { strict: false }));
    const AcademicYear = mongoose.model('AcademicYear', new mongoose.Schema({}, { strict: false }));
    const FeeStructure = mongoose.model('FeeStructure', new mongoose.Schema({}, { strict: false }));

    const years = await AcademicYear.find({}).select('_id isActive startDate').lean();
    const activeYear = years.find((y) => y.isActive) || years.sort((a, b) => Number(b.startDate) - Number(a.startDate))[0];
    if (!activeYear?._id) {
        console.error('No AcademicYear found. Aborting.');
        process.exitCode = 2;
        return;
    }

    const structures = await FeeStructure.find({ academicYearId: activeYear._id })
        .select('_id branchId class shiftName')
        .lean();

    const structureByKey = new Map();
    for (const s of structures) {
        const key = makeKey({ branchId: s.branchId, className: s.class, shiftName: s.shiftName || '' });
        structureByKey.set(key, s);
    }

    const teachers = await Staff.find({ staffType: 'teacher', isActive: true }).lean();

    let staffTouched = 0;
    let assignmentsTouched = 0;
    let unresolved = 0;

    for (const t of teachers) {
        const assignments = Array.isArray(t.assignments) ? t.assignments : [];
        if (!assignments.length) continue;

        let changed = false;
        const nextAssignments = assignments.map((a) => {
            const out = { ...a };

            // If assignment.branchId is missing, fall back to staff.branchId
            const branchId = out.branchId || t.branchId || null;
            if (!out.branchId && branchId) {
                out.branchId = branchId;
                changed = true;
                assignmentsTouched += 1;
            }

            // Fill classEntryId using (branchId + className + shiftName)
            if (!out.classEntryId && branchId) {
                const key = makeKey({
                    branchId,
                    className: out.className || out.class_name || '',
                    shiftName: out.shiftName || out.shift_name || '',
                });
                const match = structureByKey.get(key);
                if (match?._id) {
                    out.classEntryId = match._id;
                    changed = true;
                    assignmentsTouched += 1;
                } else {
                    unresolved += 1;
                }
            }

            return out;
        });

        if (!changed) continue;
        staffTouched += 1;

        if (apply) {
            await Staff.updateOne({ _id: t._id }, { $set: { assignments: nextAssignments } });
        }
    }

    console.log('\nSummary');
    console.log(`- teachers scanned: ${teachers.length}`);
    console.log(`- staff updated: ${staffTouched}`);
    console.log(`- assignment fields filled: ${assignmentsTouched}`);
    console.log(`- unresolved assignments: ${unresolved}`);

    if (!apply && staffTouched > 0) {
        console.log('\nRe-run with `--apply` to persist these changes.');
    }

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
});
