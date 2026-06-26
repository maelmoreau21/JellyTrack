export type SelectableServerRow = {
  id: string;
  name: string;
  isActive: boolean;
  url?: string | null;
  jellyfinServerId?: string | null;
};

export type SelectableServerOption = {
  id: string;
  name: string;
};

function normalizeUrl(value: string | null | undefined): string {
  return String(value || "").trim().replace(/\/+$/, "").toLowerCase();
}



function getPriority(row: SelectableServerRow): number {
  let score = 0;
  const serverId = String(row.jellyfinServerId || "").trim().toLowerCase();

  if (serverId === "master") score -= 10;
  if (!serverId) score += 5;

  return score;
}

function pickPreferredServer(rows: SelectableServerRow[]): SelectableServerRow {
  return [...rows].sort((left, right) => {
    const scoreDelta = getPriority(left) - getPriority(right);
    if (scoreDelta !== 0) return scoreDelta;

    const nameDelta = left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    if (nameDelta !== 0) return nameDelta;

    return left.id.localeCompare(right.id);
  })[0];
}

export function buildSelectableServerOptions(rows: SelectableServerRow[]): SelectableServerOption[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const activeRows = rows.filter((row) => row.isActive);
  const baseRows = activeRows.length > 0 ? activeRows : rows;

  const groupedByUrl = new Map<string, SelectableServerRow[]>();
  const withoutUrl: SelectableServerRow[] = [];

  for (const row of baseRows) {
    const urlKey = normalizeUrl(row.url);
    if (!urlKey) {
      withoutUrl.push(row);
      continue;
    }

    const group = groupedByUrl.get(urlKey);
    if (group) {
      group.push(row);
    } else {
      groupedByUrl.set(urlKey, [row]);
    }
  }

  const dedupedRows: SelectableServerRow[] = [];
  for (const group of groupedByUrl.values()) {
    dedupedRows.push(pickPreferredServer(group));
  }
  dedupedRows.push(...withoutUrl);

  dedupedRows.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));

  const seenIds = new Set<string>();
  const options: SelectableServerOption[] = [];

  for (const row of dedupedRows) {
    if (seenIds.has(row.id)) continue;
    seenIds.add(row.id);
    options.push({ id: row.id, name: row.name });
  }

  return options;
}
