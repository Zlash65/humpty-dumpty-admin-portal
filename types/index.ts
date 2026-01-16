/**
 * Shared TypeScript types for the Humpty Dumpty Admin Portal.
 *
 * Note: This app previously used Mongoose model types. After moving to Postgres,
 * these are plain TS types used across server actions, UI, and audit logging.
 */

export type AuditAction = 'create' | 'update' | 'delete' | 'login' | 'logout';

export type AuditEntity =
    | 'student'
    | 'staff'
    | 'fee'
    | 'enrollment'
    | 'transport'
    | 'branch'
    | 'academicYear'
    | 'settings'
    | 'user';

export interface IAuditLogChanges {
    [field: string]: {
        old: unknown;
        new: unknown;
    };
}

