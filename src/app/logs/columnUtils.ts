// Shared column utilities — safe for both server and client imports
export const ALL_COLUMNS = ['date', 'user', 'media', 'clientIp', 'status', 'codecs', 'duration'] as const;
export type Column = typeof ALL_COLUMNS[number];
export const DEFAULT_VISIBLE: Column[] = ['date', 'user', 'media', 'clientIp', 'status', 'duration'];

export function parseVisibleColumns(colsParam: string | undefined): Column[] {
    if (!colsParam) return DEFAULT_VISIBLE;
    const parsed = colsParam.split(',').filter(c => ALL_COLUMNS.includes(c as Column)) as Column[];
    return parsed.length >= 2 ? parsed : DEFAULT_VISIBLE;
}
