'use server';

import { getAuditLogs as fetchAuditLogs } from '@/lib/audit';

export async function getAuditLogs(filters = {}) {
    return await fetchAuditLogs(filters);
}
