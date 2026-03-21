export function recordMetric(name: string, value: number, tags?: Record<string, string>) {
  try {
    // Lightweight local-first metrics recorder — extend to pushgateway or StatsD if needed.
    if (process.env.METRICS_ENDPOINT) {
      // TODO: implement remote push (optional)
    }
    console.log(`[Metric] ${name}=${value}`, tags ?? {});
  } catch (e) {
    // non-fatal
    console.warn('[Observability] recordMetric failure', e);
  }
}

export function logEvent(level: 'info' | 'warn' | 'error', message: string, details?: unknown) {
  if (level === 'error') {
    console.error(`[Obs] ${message}`, details ?? '');
  } else if (level === 'warn') {
    console.warn(`[Obs] ${message}`, details ?? '');
  } else {
    console.log(`[Obs] ${message}`, details ?? '');
  }
}
