const FORMULA_PREFIX = /^[\s]*[=+\-@\t\r]/;

export function escapeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const safe = FORMULA_PREFIX.test(raw) ? `'${raw}` : raw;
  const escaped = safe.replace(/"/g, '""');

  return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped;
}

export function buildCsvRow(values: unknown[]): string {
  return values.map((value) => escapeCsvCell(value)).join(",");
}
