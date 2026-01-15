import type { PrismaSql } from '@/lib/prismaSql';
import { empty, join, psql } from '@/lib/prismaSql';

export type SortDirection = 'asc' | 'desc';

export interface GridSortItem {
    field: string;
    sort?: SortDirection | null;
}

export type GridSortModel = GridSortItem[];

export interface GridFilterItem {
    id?: unknown;
    field: string;
    operator?: string;
    value?: unknown;
}

export interface GridFilterModel {
    items?: GridFilterItem[];
    logicOperator?: 'and' | 'or';
    linkOperator?: 'and' | 'or';
    quickFilterValues?: unknown;
}

export type FilterValueType = 'text' | 'number' | 'boolean';

export interface FilterFieldConfig {
    expr: PrismaSql;
    type?: FilterValueType;
}

export type FilterFieldMap = Record<string, FilterFieldConfig>;

export function normalizeSortModel(raw: unknown): { field: string; direction: SortDirection } | null {
    const model = Array.isArray(raw) ? (raw as any[]) : [];
    const first = model[0] as any;
    const field = String(first?.field || '').trim();
    const sort = String(first?.sort || '').trim().toLowerCase();
    if (!field) return null;
    if (sort !== 'asc' && sort !== 'desc') return null;
    return { field, direction: sort as SortDirection };
}

export function normalizeFilterModel(raw: unknown): { items: GridFilterItem[]; logic: 'and' | 'or' } {
    const obj = raw && typeof raw === 'object' ? (raw as any) : {};
    const itemsRaw = Array.isArray(obj.items) ? obj.items : [];
    const link = String(obj.logicOperator || obj.linkOperator || 'and').toLowerCase();
    const logic: 'and' | 'or' = link === 'or' ? 'or' : 'and';

    const items: GridFilterItem[] = itemsRaw
        .map((it: any) => ({
            id: it?.id,
            field: String(it?.field || '').trim(),
            operator: typeof it?.operator === 'string' ? it.operator : undefined,
            value: it?.value,
        }))
        .filter((it: GridFilterItem) => Boolean(it.field));

    return { items, logic };
}

function safeString(v: unknown): string {
    return String(v ?? '').trim();
}

function tryNumber(v: unknown): number | null {
    const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
    return Number.isFinite(n) ? n : null;
}

function tryBoolean(v: unknown): boolean | null {
    if (typeof v === 'boolean') return v;
    const s = String(v ?? '').trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes') return true;
    if (s === 'false' || s === '0' || s === 'no') return false;
    return null;
}

function buildItemCondition(item: GridFilterItem, fieldMap: FilterFieldMap): PrismaSql | null {
    const cfg = fieldMap[item.field];
    if (!cfg) return null;

    const expr = cfg.expr;
    const operator = safeString(item.operator).toLowerCase();
    const type: FilterValueType = cfg.type || 'text';

    // Empty operators: treat as no-op.
    if (!operator) return null;

    if (operator === 'isempty') {
        if (type === 'number') return psql`${expr} IS NULL`;
        return psql`(${expr} IS NULL OR ${expr} = '')`;
    }
    if (operator === 'isnotempty') {
        if (type === 'number') return psql`${expr} IS NOT NULL`;
        return psql`(${expr} IS NOT NULL AND ${expr} <> '')`;
    }

    if (type === 'number') {
        const n = tryNumber(item.value);
        if (n === null) return null;
        if (operator === '=' || operator === 'equals') return psql`${expr} = ${n}`;
        if (operator === '!=' || operator === 'notequals') return psql`${expr} <> ${n}`;
        if (operator === '>' || operator === 'greaterthan') return psql`${expr} > ${n}`;
        if (operator === '>=' || operator === 'greaterthanorequalto') return psql`${expr} >= ${n}`;
        if (operator === '<' || operator === 'lessthan') return psql`${expr} < ${n}`;
        if (operator === '<=' || operator === 'lessthanorequalto') return psql`${expr} <= ${n}`;
        return null;
    }

    if (type === 'boolean') {
        const b = tryBoolean(item.value);
        if (b === null) return null;
        if (operator === '=' || operator === 'equals' || operator === 'is') return psql`${expr} = ${b}`;
        if (operator === '!=' || operator === 'notequals' || operator === 'not') return psql`${expr} <> ${b}`;
        return null;
    }

    // text (default)
    const s = safeString(item.value);
    if (!s && operator !== 'isempty' && operator !== 'isnotempty') return null;

    if (operator === 'contains') return psql`${expr} ILIKE ${`%${s}%`}`;
    if (operator === 'equals' || operator === '=' || operator === 'is') return psql`${expr} ILIKE ${s}`;
    if (operator === 'startswith') return psql`${expr} ILIKE ${`${s}%`}`;
    if (operator === 'endswith') return psql`${expr} ILIKE ${`%${s}`}`;
    if (operator === '!=' || operator === 'notequals' || operator === 'not') return psql`${expr} NOT ILIKE ${s}`;

    return null;
}

export function buildFilterWhereSql(filterModelRaw: unknown, fieldMap: FilterFieldMap): PrismaSql {
    const { items, logic } = normalizeFilterModel(filterModelRaw);
    const clauses = items.map((it) => buildItemCondition(it, fieldMap)).filter(Boolean) as PrismaSql[];
    if (!clauses.length) return empty;
    const glue = logic === 'or' ? ' OR ' : ' AND ';
    return psql` AND (${join(clauses, glue)})`;
}
