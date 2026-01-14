/**
 * Migration Script: SQLite (Electron) to MongoDB (Next.js)
 *
 * Usage:
 *   1. Set MONGODB_URI in .env.local and/or .env (or use default local MongoDB)
 *   2. Run: node scripts/migrate-sqlite-to-mongo.mjs /path/to/school.db
 *
 * This script will:
 *   - Read all data from SQLite database
 *   - Transform data to match MongoDB schemas
 *   - Insert into MongoDB collections
 *   - Maintain ID mappings for relationships
 */

import Database from 'better-sqlite3';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { loadEnvFiles } from './load-env.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnvFiles({ rootDir: path.join(__dirname, '..') });

// MongoDB connection - support both MONGODB_URI and separate env vars
let MONGODB_URI;
if (process.env.MONGODB_URI) {
    MONGODB_URI = process.env.MONGODB_URI;
} else if (process.env.MONGO_DB_HOST) {
    const protocol = process.env.MONGO_DB_PROTOCOL || 'mongodb';
    const host = process.env.MONGO_DB_HOST;
    const dbName = process.env.MONGO_DB_NAME;
    const options = process.env.MONGO_DB_OPTIONS || '';

    const username = process.env.MONGO_DB_USERNAME;
    const password = process.env.MONGO_DB_PASSWORD;
    const auth =
        username && password
            ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
            : '';

    if (!dbName) {
        throw new Error('MONGO_DB_NAME is required when using MONGO_DB_* environment variables');
    }

    MONGODB_URI = `${protocol}://${auth}${host}/${dbName}${options}`;
} else {
    MONGODB_URI = 'mongodb://localhost:27017/humpty-dumpty-school';
}

// ============= MongoDB Schemas =============
function normalizeReceiptNumber(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    const m = s.match(/^([cCbB])[- ]?(\d+)$/);
    if (m) return `${m[1].toUpperCase()}-${m[2]}`;
    return s;
}

function normalizeMonthKey(input) {
    if (!input) return null;
    const s = String(input).trim();
    if (!s) return null;
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const lower = s.toLowerCase();
    const found = months.find((mn) => lower.includes(mn.toLowerCase()));
    return found || s;
}

function parseSqliteDate(value) {
    if (!value) return null;
    const s = String(value).trim();
    if (!s) return null;

    // DATE columns in SQLite are often stored as YYYY-MM-DD. Parsing via `new Date('YYYY-MM-DD')`
    // is treated as UTC by most JS engines and can shift the day in local timezones.
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
}

function yearCodeFromName(name) {
    if (!name) return '0000';
    const parts = String(name).match(/\d+/g) || [];

    // Common formats:
    // - "2025-26" -> ["2025","26"] => "2526"
    // - "2024-2025" -> ["2024","2025"] => "2425"
    if (parts.length >= 2) {
        const a = parts[0];
        const b = parts[1];
        const a2 = a.length >= 2 ? a.slice(-2) : a.padStart(2, '0');
        const b2 = b.length >= 2 ? b.slice(-2) : b.padStart(2, '0');
        return `${a2}${b2}`;
    }

    const digits = parts.join('');
    if (digits.length >= 4) return digits.slice(-4);
    return digits.padStart(4, '0');
}

function branchCodeFromName(name) {
    const cleaned = String(name || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    const letters = cleaned.map((w) => w[0]).join('').toUpperCase();
    return (letters || 'BR').substring(0, 5);
}

function applySequentialMonthPayment(feeRecord, monthYearRaw, amount, paidDate) {
    const monthKey = normalizeMonthKey(monthYearRaw);
    if (!monthKey) return;

    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const targetIndex = months.indexOf(monthKey);

    if (!feeRecord.monthsPaid) feeRecord.monthsPaid = new Map();

    const addAmount = Number(amount) || 0;
    const date = paidDate || new Date();

    // Backward-compat: store the key as-is if we can't map to a month index
    if (targetIndex === -1) {
        const current = feeRecord.monthsPaid?.get?.(monthKey) || {};
        feeRecord.monthsPaid.set(monthKey, {
            amount: (Number(current.amount) || 0) + addAmount,
            paidDate: date,
            status: 'paid',
        });
        return;
    }

    // Electron parity: if month X is paid, mark all months up to X as paid.
    for (let i = 0; i <= targetIndex; i++) {
        const key = months[i];
        const existing = feeRecord.monthsPaid.get(key);
        if (!existing) {
            feeRecord.monthsPaid.set(key, {
                amount: i === targetIndex ? addAmount : 0,
                paidDate: date,
                status: 'paid',
            });
            continue;
        }

        if (i === targetIndex) {
            feeRecord.monthsPaid.set(key, {
                ...existing,
                amount: (Number(existing.amount) || 0) + addAmount,
                paidDate: date,
                status: 'paid',
            });
        }
    }
}

function applyScholarshipToFeeAmounts({ term1 = 0, term2 = 0, bookFee = 0 }, scholarshipRaw) {
    let scholarship = Number(scholarshipRaw) || 0;
    if (scholarship <= 0) return { term1, term2, bookFee };

    const out = { term1: Number(term1) || 0, term2: Number(term2) || 0, bookFee: Number(bookFee) || 0 };
    for (const key of ['term1', 'term2', 'bookFee']) {
        if (scholarship <= 0) break;
        const take = Math.min(out[key], scholarship);
        out[key] = Math.max(0, out[key] - take);
        scholarship -= take;
    }
    return out;
}

function tableExists(sqliteDb, tableName) {
    try {
        const row = sqliteDb
            .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
            .get(tableName);
        return !!row;
    } catch {
        return false;
    }
}

const BranchSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    code: { type: String, unique: true, sparse: true },
    address: String,
    contact: String,
    email: String,
    isActive: { type: Boolean, default: true },
    _sqliteId: Number // For migration mapping
}, { timestamps: true });

const AcademicYearSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, default: false },
    isLocked: { type: Boolean, default: false },
    _sqliteId: Number
}, { timestamps: true });

const StudentSchema = new mongoose.Schema({
    admissionNumber: { type: String, unique: true, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    dob: Date,
    admissionDate: Date,
    gender: { type: String, enum: ['Male', 'Female', 'Other'] },
    birthPlace: String,
    religion: String,
    address: String,
    fatherName: String,
    motherName: String,
    parentContact1: String,
    parentContact2: String,
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    feeScholarship: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    joinedAt: Date,
    _sqliteId: Number,
    _sqliteClassId: Number,
    _sqliteAcademicYearId: Number
}, { timestamps: true });

const StudentEnrollmentSchema = new mongoose.Schema({
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    class: { type: String, required: true },
    section: String,
    rollNumber: String,
    shiftName: { type: String, default: '' },
}, { timestamps: true });

const StaffSchema = new mongoose.Schema({
    name: { type: String, required: true },
    contact: String,
    email: String,
    staffType: { type: String, required: true, enum: ['office', 'teacher'] },
    role: String,
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    assignments: [{
        classEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeStructure' },
        branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
        className: String,
        shiftName: String,
        division: String
    }],
    isActive: { type: Boolean, default: true },
    _sqliteId: Number
}, { timestamps: true });

const TransportSchema = new mongoose.Schema({
    driverName: { type: String, required: true },
    driverContact: { type: String, required: true },
    route: { type: String, required: true },
    vehicleType: { type: String, required: true },
    vehicleNumber: { type: String, required: true, unique: true },
    capacity: Number,
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    isActive: { type: Boolean, default: true },
    _sqliteId: Number
}, { timestamps: true });

const FeeStructureSchema = new mongoose.Schema({
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    class: { type: String, required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    shiftName: { type: String, default: '' },
    startTime: { type: String, default: '' },
    endTime: { type: String, default: '' },
    numDivisions: { type: Number, default: 1, min: 1 },
    components: {
        term1: { type: Number, default: 0 },
        term2: { type: Number, default: 0 },
        bookFee: { type: Number, default: 0 }
    }
}, { timestamps: true });

const FeeRecordSchema = new mongoose.Schema({
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentEnrollment' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    fees: {
        term1: { amount: { type: Number, default: 0 }, paid: { type: Number, default: 0 }, status: { type: String, default: 'Pending' } },
        term2: { amount: { type: Number, default: 0 }, paid: { type: Number, default: 0 }, status: { type: String, default: 'Pending' } },
        bookFee: { amount: { type: Number, default: 0 }, paid: { type: Number, default: 0 }, status: { type: String, default: 'Pending' } }
    },
    monthsPaid: { type: Map, of: Object, default: () => new Map() },
    transactions: [{
        receiptNumber: String,
        date: Date,
        amount: Number,
        paymentMode: String,
        chequeNumber: String,
        chequeDate: Date,
        bankName: String,
        payeeName: String,
        upiId: String,
        upiReference: String,
        reference: String,
        remarks: String,
        breakdown: {
            term1: { type: Number, default: 0 },
            term2: { type: Number, default: 0 },
            bookFee: { type: Number, default: 0 }
        },
        monthYear: String,
        feeTerm: { type: String, default: '' }
    }]
}, { timestamps: true });

const ReceiptSequenceSchema = new mongoose.Schema({
    prefix: { type: String, required: true, unique: true, uppercase: true, enum: ['C', 'B'] },
    lastNumber: { type: Number, default: 0, min: 0 }
}, { timestamps: true });

const UiSettingSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, index: true },
    value: mongoose.Schema.Types.Mixed,
    category: { type: String, default: 'general' },
}, { timestamps: true });

const SequenceSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, index: true },
    value: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

// Models
const Branch = mongoose.model('Branch', BranchSchema);
const AcademicYear = mongoose.model('AcademicYear', AcademicYearSchema);
const Student = mongoose.model('Student', StudentSchema);
const StudentEnrollment = mongoose.model('StudentEnrollment', StudentEnrollmentSchema);
const Staff = mongoose.model('Staff', StaffSchema);
const Transport = mongoose.model('Transport', TransportSchema);
const FeeStructure = mongoose.model('FeeStructure', FeeStructureSchema);
const FeeRecord = mongoose.model('FeeRecord', FeeRecordSchema);
const ReceiptSequence = mongoose.model('ReceiptSequence', ReceiptSequenceSchema);
const UiSetting = mongoose.model('UiSetting', UiSettingSchema);
const Sequence = mongoose.model('Sequence', SequenceSchema);

// ============= Migration Functions =============

// ID mapping tables
const idMaps = {
    branches: new Map(),      // SQLite ID -> { _id, code, name }
    academicYears: new Map(), // SQLite ID -> { _id, name }
    classes: new Map(),       // SQLite class ID -> { name, branchId, sqliteBranchId, sqliteAcademicYearId, ... }
    students: new Map(),      // SQLite student ID -> { _id, academicYearId, branchId }
    staff: new Map(),
    studentMonthsPaid: new Map() // SQLite student ID -> months_paid object
};

async function migrateUiSettings(db) {
    console.log('\n⚙️  Migrating UI settings...');
    if (!tableExists(db, 'settings')) {
        console.log('  ⚠ No settings table found, skipping');
        return;
    }
    const rows = db.prepare('SELECT * FROM settings').all();
    let count = 0;
    for (const row of rows) {
        let value = row.value;
        try {
            value = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
        } catch {
            // keep as string
            value = row.value;
        }
        await UiSetting.findOneAndUpdate(
            { key: row.key },
            { key: row.key, value, category: row.category || 'general' },
            { upsert: true, new: true }
        );
        count++;
    }
    console.log(`  ✓ Migrated ${count} setting(s)`);
}

async function migrateBranches(db) {
    console.log('\n📦 Migrating branches...');
    const rows = db.prepare('SELECT * FROM branches').all();
    const usedCodes = new Set((await Branch.distinct('code')).filter(Boolean).map(String));

    for (const row of rows) {
        // Generate branch code from name (e.g., "Humpty Dumpty Kothrud" -> "HDK").
        // Ensure uniqueness (important for production migrations).
        const base = branchCodeFromName(row.name);
        let code = base;
        let n = 2;
        while (usedCodes.has(code)) {
            code = `${base}${n}`;
            n += 1;
        }
        const branch = await Branch.create({
            name: row.name,
            code,
            isActive: true,
            _sqliteId: row.id
        });
        usedCodes.add(code);
        idMaps.branches.set(row.id, { _id: branch._id, code, name: row.name });
        console.log(`  ✓ Branch: ${row.name} (${code})`);
    }
    console.log(`  Total: ${rows.length} branches migrated`);
}

async function migrateAcademicYears(db) {
    console.log('\n📅 Migrating academic years...');
    const rows = db.prepare('SELECT * FROM academic_years').all();

    for (const row of rows) {
        const year = await AcademicYear.create({
            name: row.name,
            startDate: parseSqliteDate(row.start_date),
            endDate: parseSqliteDate(row.end_date),
            isActive: row.is_active === 1,
            isLocked: false,
            _sqliteId: row.id
        });
        idMaps.academicYears.set(row.id, { _id: year._id, name: row.name });
        console.log(`  ✓ Academic Year: ${row.name} ${row.is_active ? '(Active)' : ''}`);
    }
    console.log(`  Total: ${rows.length} academic years migrated`);
}

async function migrateClasses(db) {
    console.log('\n🏫 Reading classes (for fee structures and enrollments)...');
    const rows = db.prepare('SELECT * FROM classes').all();

    for (const row of rows) {
        const branchInfo = idMaps.branches.get(row.branch_id) || {};
        // Prefer JSON fees if present (some Electron DBs add a `fees` column)
        const parsedFees = (() => {
            try {
                if (!row.fees) return null;
                const obj = typeof row.fees === 'string' ? JSON.parse(row.fees) : row.fees;
                if (!obj || typeof obj !== 'object') return null;
                return {
                    term1: Number(obj.term1) || 0,
                    term2: Number(obj.term2) || 0,
                    books: Number(obj.books ?? obj.books_charge) || 0,
                };
            } catch {
                return null;
            }
        })();
        idMaps.classes.set(row.id, {
            name: row.name,
            shiftName: row.shift_name,
            branchId: branchInfo._id,
            sqliteBranchId: row.branch_id,
            sqliteAcademicYearId: row.academic_year_id,
            startTime: row.start_time || '',
            endTime: row.end_time || '',
            term1Fee: parsedFees ? parsedFees.term1 : (row.term1_fee || 0),
            term2Fee: parsedFees ? parsedFees.term2 : (row.term2_fee || 0),
            booksFee: parsedFees ? parsedFees.books : (row.books_charge || 0),
            numDivisions: row.num_divisions || 1
        });
    }
    console.log(`  Total: ${rows.length} classes loaded`);

    // Create fee structures from classes
    console.log('\n💰 Creating fee structures from classes...');
    const years = await AcademicYear.find({}).select('_id isActive startDate').lean();
    const activeYear = years.find((y) => y.isActive) || years.sort((a, b) => Number(b.startDate) - Number(a.startDate))[0];

    if (!years.length) {
        console.log('  ⚠ No academic years found, skipping fee structures');
        return;
    }

    // Electron parity: the SQLite `classes` table is not year-scoped, so ensure every academic year
    // in Mongo has a corresponding set of FeeStructure docs. This keeps Classes/Fees usable when
    // switching years, matching Electron behavior.
    for (const year of years) {
        if (activeYear && String(year._id) === String(activeYear._id)) {
            // For the active year, keep a stable pointer for staff teacher assignment migration.
            for (const [, classData] of idMaps.classes) {
                const fsDoc = await FeeStructure.findOneAndUpdate(
                    { academicYearId: year._id, class: classData.name, branchId: classData.branchId, shiftName: classData.shiftName || '' },
                    {
                        academicYearId: year._id,
                        class: classData.name,
                        branchId: classData.branchId,
                        shiftName: classData.shiftName || '',
                        startTime: classData.startTime || '',
                        endTime: classData.endTime || '',
                        numDivisions: classData.numDivisions || 1,
                        components: {
                            term1: classData.term1Fee,
                            term2: classData.term2Fee,
                            bookFee: classData.booksFee
                        }
                    },
                    { upsert: true, new: true }
                );
                if (fsDoc?._id) classData.feeStructureId = fsDoc._id;
            }
        } else {
            // Other years: bulk upsert (no need to read back ids).
            const ops = [];
            for (const [, classData] of idMaps.classes) {
                ops.push({
                    updateOne: {
                        filter: { academicYearId: year._id, class: classData.name, branchId: classData.branchId, shiftName: classData.shiftName || '' },
                        update: {
                            $setOnInsert: {
                                academicYearId: year._id,
                                class: classData.name,
                                branchId: classData.branchId,
                                shiftName: classData.shiftName || '',
                                startTime: classData.startTime || '',
                                endTime: classData.endTime || '',
                                numDivisions: classData.numDivisions || 1,
                                components: {
                                    term1: classData.term1Fee,
                                    term2: classData.term2Fee,
                                    bookFee: classData.booksFee
                                }
                            }
                        },
                        upsert: true,
                    }
                });
            }
            if (ops.length) await FeeStructure.bulkWrite(ops, { ordered: false });
        }
    }

    console.log(`  ✓ Created fee structures for ${idMaps.classes.size} classes across ${years.length} year(s)`);
}

async function migrateStudents(db) {
    console.log('\n👨‍🎓 Migrating students...');
    const rows = db.prepare('SELECT * FROM students').all();

    let count = 0;
    for (const row of rows) {
        // Parse name (assuming "FirstName LastName" format)
        const nameParts = (row.name || '').trim().split(' ');
        const firstName = nameParts[0] || 'Unknown';
        const lastName = nameParts.slice(1).join(' ') || '';

        // Get class info
        const classInfo = idMaps.classes.get(row.class_id) || {};
        const branchInfo = idMaps.branches.get(classInfo.sqliteBranchId || row.branch_id) || {};
        const academicYearInfo = idMaps.academicYears.get(row.academic_year_id) || {};
        const branchId = branchInfo._id || (idMaps.branches.values().next().value || {})._id;

        // Generate truly unique admission number using SQLite student ID
        // Format: BRANCHCODE-YEARCODE-STUDENTID (e.g., HDK-2526-00001)
        // This guarantees uniqueness since SQLite IDs are unique
        const branchCode = branchInfo.code || 'UNK';
        const yearCode = yearCodeFromName(academicYearInfo.name || '');
        const studentIdPadded = String(row.id).padStart(5, '0');
        const admissionNumber = `${branchCode}-${yearCode}-${studentIdPadded}`;

        try {
            // Preserve Electron's months_paid JSON as-is for later application.
            try {
                const rawMonths = row.months_paid;
                const parsed = rawMonths ? (typeof rawMonths === 'string' ? JSON.parse(rawMonths) : rawMonths) : null;
                if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
                    idMaps.studentMonthsPaid.set(row.id, parsed);
                }
            } catch {
                // ignore malformed months_paid
            }

            const student = await Student.create({
                admissionNumber,
                firstName,
                lastName: lastName || firstName, // Use firstName if no lastName
                admissionDate: parseSqliteDate(row.admission_date) || parseSqliteDate(row.created_at) || new Date(),
                gender: row.gender === 'M' || row.gender === 'Male' ? 'Male' :
                        row.gender === 'F' || row.gender === 'Female' ? 'Female' : 'Other',
                birthPlace: row.birth_place,
                religion: row.religion,
                address: row.address,
                fatherName: row.father_name,
                motherName: row.mother_name,
                parentContact1: row.parents_contact1,
                parentContact2: row.parents_contact2,
                branchId,
                feeScholarship: row.fee_scholarship || 0,
                isActive: true,
                joinedAt: parseSqliteDate(row.admission_date) || parseSqliteDate(row.created_at) || new Date(),
                _sqliteId: row.id,
                _sqliteClassId: row.class_id,
                _sqliteAcademicYearId: row.academic_year_id
            });

            idMaps.students.set(row.id, { _id: student._id, academicYearId: academicYearInfo._id, branchId });
            count++;

            // Create enrollment
            const academicYearId = academicYearInfo._id;
            if (academicYearId && classInfo.name) {
                const enrollment = await StudentEnrollment.create({
                    academicYearId,
                    studentId: student._id,
                    class: classInfo.name,
                    section: row.division || 'A',
                    rollNumber: row.roll_number,
                    shiftName: classInfo.shiftName || '',
                });

                // Create fee record for enrollment
                const adjustedFees = applyScholarshipToFeeAmounts(
                    { term1: classInfo.term1Fee || 0, term2: classInfo.term2Fee || 0, bookFee: classInfo.booksFee || 0 },
                    row.fee_scholarship
                );
                await FeeRecord.findOneAndUpdate(
                    { academicYearId, studentId: student._id },
                    {
                        academicYearId,
                        studentId: student._id,
                        enrollmentId: enrollment._id,
                        branchId,
                        fees: {
                            term1: { amount: adjustedFees.term1, paid: 0, status: adjustedFees.term1 <= 0 ? 'Paid' : 'Pending' },
                            term2: { amount: adjustedFees.term2, paid: 0, status: adjustedFees.term2 <= 0 ? 'Paid' : 'Pending' },
                            bookFee: { amount: adjustedFees.bookFee, paid: 0, status: adjustedFees.bookFee <= 0 ? 'Paid' : 'Pending' },
                        },
                        transactions: []
                    },
                    { upsert: true, new: true }
                );
            }

            if (count % 50 === 0) {
                console.log(`  ... ${count} students processed`);
            }
        } catch (error) {
            console.error(`  ✗ Error migrating student ${row.name}: ${error.message}`);
        }
    }
    console.log(`  Total: ${count} students migrated`);
}

async function migrateStaff(db) {
    console.log('\n👩‍🏫 Migrating staff...');
    const staffRows = db.prepare('SELECT * FROM staff').all();
    const assignmentRows = db.prepare('SELECT * FROM teacher_assignments').all();

    // Group assignments by staff_id
    const assignmentsByStaff = new Map();
    for (const row of assignmentRows) {
        if (!assignmentsByStaff.has(row.staff_id)) {
            assignmentsByStaff.set(row.staff_id, []);
        }
        const classInfo = idMaps.classes.get(row.class_id) || {};
        assignmentsByStaff.get(row.staff_id).push({
            classEntryId: classInfo.feeStructureId,
            branchId: classInfo.branchId,
            className: classInfo.name || 'Unknown',
            shiftName: classInfo.shiftName || '',
            division: row.division || ''
        });
    }

    for (const row of staffRows) {
        const assignments = assignmentsByStaff.get(row.id) || [];
        // Infer branchId for teachers if all assignments point to the same branch
        let inferredBranchId;
        if (row.staff_type === 'teacher' && assignments.length) {
            const branchIds = new Set(
                assignments
                    .map((a) => {
                        // resolve branchId from classes map by class name+shift (best effort)
                        for (const [, classData] of idMaps.classes) {
                            if (classData.name === a.className && String(classData.shiftName || '') === String(a.shiftName || '')) {
                                return classData.branchId || null;
                            }
                        }
                        return null;
                    })
                    .filter(Boolean)
            );
            if (branchIds.size === 1) inferredBranchId = [...branchIds][0];
        }

        const staff = await Staff.create({
            name: row.name,
            contact: row.contact,
            staffType: row.staff_type,
            role: row.role,
            assignments,
            ...(inferredBranchId ? { branchId: inferredBranchId } : {}),
            isActive: true,
            _sqliteId: row.id
        });
        idMaps.staff.set(row.id, staff._id);
        console.log(`  ✓ Staff: ${row.name} (${row.staff_type})`);
    }
    console.log(`  Total: ${staffRows.length} staff migrated`);
}

async function migrateTransports(db) {
    console.log('\n🚌 Migrating transports...');
    const tableName = tableExists(db, 'transports') ? 'transports' : (tableExists(db, 'transport') ? 'transport' : null);
    if (!tableName) {
        console.log('  ⚠ No transport(s) table found, skipping');
        return;
    }
    const rows = db.prepare(`SELECT * FROM ${tableName}`).all();

    for (const row of rows) {
        await Transport.create({
            driverName: row.driver_name,
            driverContact: row.driver_contact,
            route: row.driver_route,
            vehicleType: row.driver_car,
            vehicleNumber: row.driver_car_number,
            isActive: true,
            _sqliteId: row.id
        });
        console.log(`  ✓ Vehicle: ${row.driver_car_number}`);
    }
    console.log(`  Total: ${rows.length} transports migrated`);
}

async function migrateFees(db) {
    console.log('\n💵 Migrating fee payments...');
    const rows = db.prepare('SELECT * FROM fees ORDER BY student_id, payment_date').all();

    let count = 0;
    let errors = 0;
    const maxByPrefix = { C: 0, B: 0 };
    const seenNormalizedReceipts = new Map();

    const activeYear = await AcademicYear.findOne({ isActive: true }).lean();
    const defaultYearInfo = idMaps.academicYears.values().next().value || {};
    const activeYearId = activeYear?._id || defaultYearInfo._id;

    for (const row of rows) {
        const studentInfo = idMaps.students.get(row.student_id);
        const studentId = studentInfo?._id || studentInfo;
        const academicYearInfo = idMaps.academicYears.get(row.academic_year_id) || {};
        const branchInfo = idMaps.branches.get(row.branch_id) || {};
        const academicYearId = academicYearInfo._id || studentInfo?.academicYearId || activeYearId;
        const branchId = branchInfo._id || studentInfo?.branchId;

        if (!studentId || !academicYearId) {
            errors++;
            continue;
        }

        // Find existing fee record or create one
        let feeRecord = await FeeRecord.findOne({ studentId, academicYearId });

        if (!feeRecord) {
            // Create a fee record if not exists (best-effort: infer due amounts + apply scholarship)
            const [studentDoc, enrollment] = await Promise.all([
                Student.findById(studentId).select('feeScholarship branchId').lean(),
                StudentEnrollment.findOne({ studentId, academicYearId }).lean(),
            ]);

            let term1Amount = 0;
            let term2Amount = 0;
            let bookFeeAmount = 0;

            if (enrollment?.class) {
                const inferredBranchId = branchId || studentDoc?.branchId || undefined;
                const inferredShiftName = enrollment?.shiftName || '';
                const fsDoc =
                    (inferredBranchId &&
                        ((await FeeStructure.findOne({ academicYearId, branchId: inferredBranchId, class: enrollment.class, shiftName: inferredShiftName })) ||
                            (await FeeStructure.findOne({ academicYearId, branchId: inferredBranchId, class: enrollment.class, shiftName: '' })))) ||
                    (await FeeStructure.findOne({ academicYearId, class: enrollment.class, shiftName: inferredShiftName })) ||
                    (await FeeStructure.findOne({ academicYearId, class: enrollment.class, shiftName: '' }));

                term1Amount = fsDoc?.components?.term1 || 0;
                term2Amount = fsDoc?.components?.term2 || 0;
                bookFeeAmount = fsDoc?.components?.bookFee || 0;
            }

            const adjusted = applyScholarshipToFeeAmounts(
                { term1: term1Amount, term2: term2Amount, bookFee: bookFeeAmount },
                studentDoc?.feeScholarship
            );

            feeRecord = await FeeRecord.create({
                academicYearId,
                studentId,
                branchId,
                fees: {
                    term1: { amount: adjusted.term1, paid: 0, status: adjusted.term1 <= 0 ? 'Paid' : 'Pending' },
                    term2: { amount: adjusted.term2, paid: 0, status: adjusted.term2 <= 0 ? 'Paid' : 'Pending' },
                    bookFee: { amount: adjusted.bookFee, paid: 0, status: adjusted.bookFee <= 0 ? 'Paid' : 'Pending' }
                },
                transactions: []
            });
        }

        // Determine payment mode
        const paymentMode = row.payment_type === 'cash' ? 'Cash' :
                           row.payment_type === 'bank' ? 'Bank Transfer' : 'Cash';

        // Determine which fee component this payment applies to
        let breakdown = { term1: 0, term2: 0, bookFee: 0 };
        const feeTerm = (row.fee_term || '').toLowerCase();
        if (feeTerm.includes('term1') || feeTerm.includes('term 1')) {
            breakdown.term1 = row.amount;
        } else if (feeTerm.includes('term2') || feeTerm.includes('term 2')) {
            breakdown.term2 = row.amount;
        } else if (feeTerm.includes('book')) {
            breakdown.bookFee = row.amount;
        } else {
            // Default: distribute to term1
            breakdown.term1 = row.amount;
        }

        // Add transaction
        const rawReceipt = row.receipt_number;
        const normalizedReceipt = normalizeReceiptNumber(rawReceipt);
        if (normalizedReceipt) {
            const prevRaw = seenNormalizedReceipts.get(normalizedReceipt);
            if (prevRaw && prevRaw !== rawReceipt) {
                throw new Error(
                    `Receipt normalization collision: "${rawReceipt}" and "${prevRaw}" both normalize to "${normalizedReceipt}". ` +
                    'Fix the duplicate/case-variant receipts in SQLite before migrating.'
                );
            }
            seenNormalizedReceipts.set(normalizedReceipt, rawReceipt);
        }
        const match = normalizedReceipt ? normalizedReceipt.match(/^([CB])-(\d+)$/) : null;
        if (match) {
            const prefix = match[1];
            const n = parseInt(match[2], 10);
            if (Number.isFinite(n)) maxByPrefix[prefix] = Math.max(maxByPrefix[prefix] || 0, n);
        }

        feeRecord.transactions.push({
            receiptNumber: normalizedReceipt || rawReceipt,
            date: parseSqliteDate(row.payment_date) || parseSqliteDate(row.created_at) || new Date(),
            amount: row.amount,
            paymentMode,
            chequeNumber: row.cheque_number,
            chequeDate: parseSqliteDate(row.cheque_date),
            bankName: row.bank_name,
            payeeName: row.payee_name,
            remarks: row.notes,
            breakdown,
            monthYear: row.month_year,
            feeTerm: row.fee_term || ''
        });

        // Update paid amounts
        feeRecord.fees.term1.paid += breakdown.term1;
        feeRecord.fees.term2.paid += breakdown.term2;
        feeRecord.fees.bookFee.paid += breakdown.bookFee;

        // Update statuses
        ['term1', 'term2', 'bookFee'].forEach(head => {
            if (feeRecord.fees[head].paid >= feeRecord.fees[head].amount && feeRecord.fees[head].amount > 0) {
                feeRecord.fees[head].status = 'Paid';
            } else if (feeRecord.fees[head].paid > 0) {
                feeRecord.fees[head].status = 'Partial';
            }
        });

        // Update monthly tracking (Electron parity: sequential months)
        applySequentialMonthPayment(
            feeRecord,
            row.month_year,
            row.amount,
            parseSqliteDate(row.payment_date) || parseSqliteDate(row.created_at) || new Date()
        );

        await feeRecord.save();
        count++;

        if (count % 50 === 0) {
            console.log(`  ... ${count} fee payments processed`);
        }
    }
    console.log(`  Total: ${count} fee payments migrated (${errors} skipped due to missing students)`);

    // Initialize receipt sequences so production runtime never needs to scan for max
    for (const prefix of ['C', 'B']) {
        const lastNumber = maxByPrefix[prefix] || 0;
        await ReceiptSequence.findOneAndUpdate(
            { prefix },
            { prefix, lastNumber },
            { upsert: true, new: true }
        );
        console.log(`  ✓ ReceiptSequence ${prefix}-*: lastNumber=${lastNumber}`);
    }
}

async function applyMonthsPaidFromSqlite() {
    const entries = [...idMaps.studentMonthsPaid.entries()];
    if (entries.length === 0) return;
    console.log('\n🗓️  Applying months_paid (Electron parity)...');

    let applied = 0;
    for (const [sqliteStudentId, monthsPaid] of entries) {
        const info = idMaps.students.get(sqliteStudentId);
        if (!info?._id || !info?.academicYearId) continue;
        const record = await FeeRecord.findOne({ academicYearId: info.academicYearId, studentId: info._id });
        if (!record) continue;

        record.monthsPaid = new Map();
        for (const [month, v] of Object.entries(monthsPaid || {})) {
            const amount = Number(v?.amount) || 0;
            const paidDate = parseSqliteDate(v?.paid_date) || parseSqliteDate(v?.paidDate);
            const status = v?.status || 'paid';
            record.monthsPaid.set(month, {
                amount,
                paidDate: paidDate && !Number.isNaN(paidDate.getTime()) ? paidDate : null,
                status,
            });
        }
        await record.save();
        applied++;
    }

    console.log(`  ✓ Applied months_paid for ${applied} student(s)`);
}

async function clearDatabase() {
    console.log('\n🗑️  Clearing existing MongoDB data...');
    await Branch.deleteMany({});
    await AcademicYear.deleteMany({});
    await Student.deleteMany({});
    await StudentEnrollment.deleteMany({});
    await Staff.deleteMany({});
    await Transport.deleteMany({});
    await FeeStructure.deleteMany({});
    await FeeRecord.deleteMany({});
    await ReceiptSequence.deleteMany({});
    await UiSetting.deleteMany({});
    await Sequence.deleteMany({});
    console.log('  ✓ All collections cleared');
}

// ============= Main Migration =============

async function main() {
    const args = process.argv.slice(2);
    const sqlitePath = args.find((a) => !a.startsWith('-'));
    const shouldClear = args.includes('--clear');

    if (!sqlitePath) {
        console.error('Usage: node scripts/migrate-sqlite-to-mongo.mjs /path/to/school.db [--clear]');
        process.exit(1);
    }

    if (!fs.existsSync(sqlitePath)) {
        console.error(`SQLite DB not found: ${sqlitePath}`);
        process.exit(1);
    }

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║   SQLite to MongoDB Migration Script                       ║');
    console.log('║   Humpty Dumpty School Admin                               ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    console.log(`\n📂 SQLite Database: ${sqlitePath}`);
    // Redact credentials in logs
    const redactedMongoUri = MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/g, '//***:***@');
    console.log(`🍃 MongoDB URI: ${redactedMongoUri}`);

    let db;
    try {
        // Connect to MongoDB
        console.log('\n🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('  ✓ Connected to MongoDB');

        // Clear existing data only when explicitly requested (safer for production)
        if (shouldClear) {
            await clearDatabase();
        } else {
            const existing = await FeeRecord.countDocuments({});
            if (existing > 0) {
                console.log('\n⚠️  MongoDB already has data.');
                console.log('   Re-run with `--clear` to wipe and re-import, or use a fresh database.');
                await mongoose.disconnect();
                process.exit(2);
            }
        }

        // Open SQLite database
        console.log('\n📖 Opening SQLite database...');
        db = new Database(sqlitePath, { readonly: true });
        console.log('  ✓ SQLite database opened');

        // Run migrations in order
        await migrateBranches(db);
        await migrateAcademicYears(db);
        await migrateUiSettings(db);
        await migrateClasses(db);
        await migrateStudents(db);
        await migrateStaff(db);
        await migrateTransports(db);
        await migrateFees(db);
        await applyMonthsPaidFromSqlite();

        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║   ✅ Migration completed successfully!                      ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log('\nNext steps:');
        console.log('  1. Set MONGODB_URI in .env.local/.env (or production env vars) if using remote MongoDB');
        console.log('  2. Run: npm run indexes:create');
        console.log('  3. Run: npm run verify:migration');
        console.log('  4. Run: npm run dev');
        console.log('  5. Open http://localhost:3000 and login with admin credentials');

    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        process.exit(1);
    } finally {
        try {
            if (db) db.close();
        } catch {
            // ignore
        }
        try {
            if (mongoose.connection?.readyState === 1) {
                await mongoose.disconnect();
            }
        } catch {
            // ignore
        }
    }
}

main();
