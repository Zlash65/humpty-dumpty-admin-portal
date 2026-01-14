'use server';

import { getAuditLogs as fetchAuditLogs, AuditLogFilters, AuditLogResult } from '@/lib/audit';

export async function getAuditLogs(filters: AuditLogFilters = {}): Promise<AuditLogResult> {
    return await fetchAuditLogs(filters);
}
