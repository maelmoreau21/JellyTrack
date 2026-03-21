export function formatSize(bytes: bigint | number | null | undefined) {
  const n = typeof bytes === 'bigint' ? Number(bytes) : Number(bytes ?? 0);
  if (Number.isNaN(n)) return { value: '0.0', unit: 'Go' };
  const tb = n / (1024 ** 4);
  if (tb >= 1) return { value: tb.toFixed(2), unit: 'To' };
  const gb = n / (1024 ** 3);
  return { value: gb.toFixed(1), unit: 'Go' };
}

export default formatSize;
