import { logger } from "@/lib/logger";

export function recordMetric(name: string, value: number, tags?: Record<string, string>) {
  try {
    const endpoint = process.env.METRICS_ENDPOINT;
    if (endpoint) {
      const apiKey = process.env.METRICS_API_KEY;
      const headers: Record<string, string> = { 
        'Content-Type': 'application/json',
        'User-Agent': 'JellyTrack-Server/1.0'
      };
      if (apiKey) headers['X-Api-Key'] = apiKey;

      // Fire and forget push (non-blocking)
      fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          metric: name, 
          value, 
          tags: { ...tags, source: 'jellytrack-server' }, 
          timestamp: new Date().toISOString() 
        }),
        // Ensure this doesn't hang the request
        signal: AbortSignal.timeout(2000)
      }).then(res => {
        if (!res.ok) logger.warn({ status: res.status }, `[Obs] Remote push returned non-ok status`);
      }).catch(err => logger.error({ err: err.message }, '[Obs] Push failed'));
    }
    
    // Always log locally for debugging unless suppressed
    if (process.env.DEBUG_METRICS === 'true') {
      logger.debug({ name, value, tags }, `[Metric] logged`);
    }
  } catch (e) {
    // non-fatal
    logger.warn({ err: e }, '[Observability] recordMetric failure');
  }
}

export function logEvent(level: 'info' | 'warn' | 'error', message: string, details?: unknown) {
  if (level === 'error') {
    logger.error({ details }, message);
  } else if (level === 'warn') {
    logger.warn({ details }, message);
  } else {
    logger.info({ details }, message);
  }
}

