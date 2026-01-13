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
    rollNumber: String
}, { timestamps: true });

const StaffSchema = new mongoose.Schema({
    name: { type: String, required: true },
    contact: String,
    email: String,
    staffType: { type: String, required: true, enum: ['office', 'teacher'] },
    role: String,
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    assignments: [{
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
        reference: String,
        remarks: String,
        breakdown: {
            term1: { type: Number, default: 0 },
            term2: { type: Number, default: 0 },
            bookFee: { type: Number, default: 0 }
        },
        monthYear: String
    }]
}, { timestamps: true });

const ReceiptSequenceSchema = new mongoose.Schema({
    prefix: { type: String, required: true, unique: true, uppercase: true, enum: ['C', 'B'] },
    lastNumber: { type: Number, default: 0, min: 0 }
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

// ============= Migration Functions =============

// ID mapping tables
const idMaps = {
    branches: new Map(),      // SQLite ID -> { _id, code, name }
    academicYears: new Map(), // SQLite ID -> { _id, name, code }
    classes: new Map(),       // SQLite class ID -> { name, branchId, sqliteBranchId, sqliteAcademicYearId, ... }
    students: new Map(),      // SQLite student ID -> { _id, academicYearId, branchId }
    staff: new Map()
};

async function migrateBranches(db) {
    console.log('\n📦 Migrating branches...');
    const rows = db.prepare('SELECT * FROM branches').all();

    for (const row of rows) {
        // Generate branch code from name (e.g., "Humpty Dumpty Kothrud" -> "HDK")
        const code = row.name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 5);
        const branch = await Branch.create({
            name: row.name,
            code,
            isActive: true,
            _sqliteId: row.id
        });
        idMaps.branches.set(row.id, { _id: branch._id, code, name: row.name });
        console.log(`  ✓ Branch: ${row.name} (${code})`);
    }
    console.log(`  Total: ${rows.length} branches migrated`);
}

async function migrateAcademicYears(db) {
    console.log('\n📅 Migrating academic years...');
    const rows = db.prepare('SELECT * FROM academic_years').all();

    for (const row of rows) {
        // Generate year code from name (e.g., "2025-26" -> "2526", "2024-25" -> "2425")
        const yearCode = row.name.replace(/[^0-9]/g, '').substring(2, 4) + row.name.replace(/[^0-9]/g, '').substring(6, 8);
        const year = await AcademicYear.create({
            name: row.name,
            startDate: new Date(row.start_date),
            endDate: new Date(row.end_date),
            isActive: row.is_active === 1,
            isLocked: false,
            _sqliteId: row.id
        });
        idMaps.academicYears.set(row.id, { _id: year._id, name: row.name, code: yearCode });
        console.log(`  ✓ Academic Year: ${row.name} (${yearCode}) ${row.is_active ? '(Active)' : ''}`);
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
            term1Fee: parsedFees ? parsedFees.term1 : (row.term1_fee || 0),
            term2Fee: parsedFees ? parsedFees.term2 : (row.term2_fee || 0),
            booksFee: parsedFees ? parsedFees.books : (row.books_charge || 0),
            numDivisions: row.num_divisions || 1
        });
    }
    console.log(`  Total: ${rows.length} classes loaded`);

    // Create fee structures from classes
    console.log('\n💰 Creating fee structures from classes...');
    const activeYear = await AcademicYear.findOne({ isActive: true });
    if (activeYear) {
        for (const [classId, classData] of idMaps.classes) {
            await FeeStructure.findOneAndUpdate(
                { academicYearId: activeYear._id, class: classData.name, branchId: classData.branchId, shiftName: classData.shiftName || '' },
                {
                    academicYearId: activeYear._id,
                    class: classData.name,
                    branchId: classData.branchId,
                    shiftName: classData.shiftName || '',
                    components: {
                        term1: classData.term1Fee,
                        term2: classData.term2Fee,
                        bookFee: classData.booksFee
                    }
                },
                { upsert: true, new: true }
            );
        }
        console.log(`  ✓ Created fee structures for ${idMaps.classes.size} classes`);
    }
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
        // Extract year code properly: "2025-26" -> "2526"
        const yearName = academicYearInfo.name || '2025-26';
        const yearParts = yearName.match(/(\d{2})(\d{2})-(\d{2})/);
        const yearCode = yearParts ? `${yearParts[2]}${yearParts[3]}` : '0000';
        const studentIdPadded = String(row.id).padStart(5, '0');
        const admissionNumber = `${branchCode}-${yearCode}-${studentIdPadded}`;

        try {
            const student = await Student.create({
                admissionNumber,
                firstName,
                lastName: lastName || firstName, // Use firstName if no lastName
                dob: row.admission_date ? new Date(row.admission_date) : null,
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
                joinedAt: row.admission_date ? new Date(row.admission_date) : new Date(row.created_at),
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
                    rollNumber: row.roll_number
                });

                // Create fee record for enrollment
                await FeeRecord.findOneAndUpdate(
                    { academicYearId, studentId: student._id },
                    {
                        academicYearId,
                        studentId: student._id,
                        enrollmentId: enrollment._id,
                        branchId,
                        fees: {
                            term1: { amount: classInfo.term1Fee || 0, paid: 0, status: 'Pending' },
                            term2: { amount: classInfo.term2Fee || 0, paid: 0, status: 'Pending' },
                            bookFee: { amount: classInfo.booksFee || 0, paid: 0, status: 'Pending' }
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
            // Create a fee record if not exists
            feeRecord = await FeeRecord.create({
                academicYearId,
                studentId,
                branchId,
                fees: {
                    term1: { amount: 0, paid: 0, status: 'Pending' },
                    term2: { amount: 0, paid: 0, status: 'Pending' },
                    bookFee: { amount: 0, paid: 0, status: 'Pending' }
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
            date: row.payment_date ? new Date(row.payment_date) : new Date(row.created_at),
            amount: row.amount,
            paymentMode,
            chequeNumber: row.cheque_number,
            chequeDate: row.cheque_date ? new Date(row.cheque_date) : null,
            bankName: row.bank_name,
            payeeName: row.payee_name,
            remarks: row.notes,
            breakdown,
            monthYear: row.month_year
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
            row.payment_date ? new Date(row.payment_date) : (row.created_at ? new Date(row.created_at) : new Date())
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
        await migrateClasses(db);
        await migrateStudents(db);
        await migrateStaff(db);
        await migrateTransports(db);
        await migrateFees(db);

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
