/**
 * Shared TypeScript types for the Humpty Dumpty Admin Portal
 */

import { Types } from 'mongoose';

// Re-export model interfaces for convenience
export type { IUser, IUserDocument } from '@/models/User';
export type { IStudent, IStudentDocument, Gender } from '@/models/Student';
export type { IStaff, IStaffDocument, ITeacherAssignment, StaffType } from '@/models/Staff';
export type { IBranch, IBranchDocument } from '@/models/Branch';
export type { IAcademicYear, IAcademicYearDocument } from '@/models/AcademicYear';
export type { ITransport, ITransportDocument } from '@/models/Transport';
export type { IFeeStructure, IFeeStructureDocument, IFeeComponents } from '@/models/FeeStructure';
export type {
    IFeeRecord,
    IFeeRecordDocument,
    IFeeHead,
    ITransaction,
    IFees,
    IMonthPayment,
    IFeeBreakdown,
    FeeStatus,
    PaymentMode,
    MonthPaymentStatus
} from '@/models/FeeRecord';
export type { IStudentEnrollment, IStudentEnrollmentDocument, EnrollmentStatus } from '@/models/StudentEnrollment';
export type { IAuditLog, IAuditLogDocument, IAuditLogChanges, AuditAction, AuditEntity } from '@/models/AuditLog';
export type { ISettings, ISettingsDocument } from '@/models/Settings';
export type { ISequence, ISequenceDocument } from '@/models/Sequence';
export type { IReceiptSequence, IReceiptSequenceDocument } from '@/models/ReceiptSequence';
export type { IUiSetting, IUiSettingDocument } from '@/models/UiSetting';

// API Response Types
export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
    total: number;
    page: number;
    totalPages: number;
    limit: number;
}

// Common Query Types
export interface PaginationParams {
    page?: number;
    limit?: number;
}

export interface SortParams {
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

export interface SearchParams {
    search?: string;
    q?: string;
}

export interface DateRangeParams {
    startDate?: string | Date;
    endDate?: string | Date;
}

export interface CommonQueryParams extends PaginationParams, SortParams, SearchParams, DateRangeParams {}

// Serialized Document Types (for JSON responses)
export interface SerializedDocument {
    _id: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface SerializedStudent extends SerializedDocument {
    admissionNumber: string;
    firstName: string;
    lastName: string;
    fullName: string;
    dob?: string | null;
    admissionDate: string;
    gender: string;
    birthPlace?: string;
    religion?: string;
    address?: string;
    fatherName?: string;
    motherName?: string;
    parentContact1?: string;
    parentContact2?: string;
    branchId?: string;
    branchName?: string;
    feeScholarship: number;
    isActive: boolean;
    joinedAt: string;
}

export interface SerializedStaff extends SerializedDocument {
    name: string;
    contact?: string;
    email?: string;
    staffType: string;
    role?: string;
    branchId?: string;
    branchName?: string;
    assignments: Array<{
        classEntryId?: string;
        branchId?: string;
        className: string;
        shiftName?: string;
        division?: string;
    }>;
    isActive: boolean;
}

export interface SerializedBranch extends SerializedDocument {
    name: string;
    code?: string;
    address?: string;
    contact?: string;
    email?: string;
    isActive: boolean;
}

export interface SerializedAcademicYear extends SerializedDocument {
    name: string;
    startDate: string;
    endDate: string;
    isActive: boolean;
    isLocked: boolean;
}

export interface SerializedTransport extends SerializedDocument {
    driverName: string;
    driverContact: string;
    route: string;
    vehicleType: string;
    vehicleNumber: string;
    capacity?: number;
    branchId?: string;
    branchName?: string;
    isActive: boolean;
}

export interface SerializedFeeStructure extends SerializedDocument {
    academicYearId: string;
    academicYearName?: string;
    branchId?: string;
    branchName?: string;
    class: string;
    shiftName: string;
    startTime: string;
    endTime: string;
    numDivisions: number;
    components: {
        term1: number;
        term2: number;
        bookFee: number;
    };
}

export interface SerializedEnrollment extends SerializedDocument {
    academicYearId: string;
    academicYearName?: string;
    studentId: string;
    studentName?: string;
    class: string;
    section: string;
    rollNumber?: string;
    shiftName: string;
    status: string;
    joinDate: string;
    leaveDate?: string;
}

export interface SerializedFeeRecord extends SerializedDocument {
    academicYearId: string;
    academicYearName?: string;
    studentId: string;
    studentName?: string;
    enrollmentId?: string;
    branchId?: string;
    branchName?: string;
    fees: {
        term1: { amount: number; paid: number; status: string };
        term2: { amount: number; paid: number; status: string };
        bookFee: { amount: number; paid: number; status: string };
    };
    totalDue: number;
    totalPaid: number;
    balance: number;
    overallStatus: string;
    transactions: Array<{
        receiptNumber: string;
        date: string;
        amount: number;
        paymentMode: string;
        chequeNumber?: string;
        chequeDate?: string;
        bankName?: string;
        payeeName?: string;
        upiId?: string;
        upiReference?: string;
        reference?: string;
        remarks?: string;
        breakdown: { term1: number; term2: number; bookFee: number };
        monthYear?: string;
        feeTerm: string;
    }>;
}

// Form Data Types
export interface StudentFormData {
    admissionNumber: string;
    firstName: string;
    lastName: string;
    dob?: string | null;
    admissionDate: string;
    gender: string;
    birthPlace?: string;
    religion?: string;
    address?: string;
    fatherName?: string;
    motherName?: string;
    parentContact1?: string;
    parentContact2?: string;
    branchId?: string;
    feeScholarship?: number;
    isActive?: boolean;
}

export interface StaffFormData {
    name: string;
    contact?: string;
    email?: string;
    staffType: string;
    role?: string;
    branchId?: string;
    assignments?: Array<{
        classEntryId?: string;
        branchId?: string;
        className: string;
        shiftName?: string;
        division?: string;
    }>;
    isActive?: boolean;
}

export interface EnrollmentFormData {
    academicYearId: string;
    studentId: string;
    class: string;
    section: string;
    rollNumber?: string;
    shiftName?: string;
    status?: string;
}

export interface PaymentFormData {
    amount: number;
    paymentMode: string;
    chequeNumber?: string;
    chequeDate?: string;
    bankName?: string;
    payeeName?: string;
    upiId?: string;
    upiReference?: string;
    reference?: string;
    remarks?: string;
    breakdown?: {
        term1?: number;
        term2?: number;
        bookFee?: number;
    };
    monthYear?: string;
    feeTerm?: string;
}

// Utility Types
export type ObjectId = Types.ObjectId | string;

export type WithTimestamps<T> = T & {
    createdAt: Date;
    updatedAt: Date;
};

export type Nullable<T> = T | null;

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// Next.js Page Props Types
export interface PageProps<P = Record<string, string>, S = Record<string, string | string[] | undefined>> {
    params: Promise<P>;
    searchParams: Promise<S>;
}

// Dashboard Types
export interface DashboardStats {
    totalStudents: number;
    activeStudents: number;
    totalStaff: number;
    totalBranches: number;
    totalCollected: number;
    totalPending: number;
    collectionRate: number;
}

export interface RecentActivity {
    id: string;
    type: 'enrollment' | 'payment' | 'student' | 'staff';
    description: string;
    timestamp: string;
    entityId?: string;
    entityName?: string;
}
