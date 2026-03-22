#!/usr/bin/env node
// Fetch items from Jellyfin with adaptive pagination for debugging sync issues.
// Usage: JELLYFIN_URL=https://jellyfin:8096 JELLYFIN_API_KEY=xxxx node scripts/fetch_jellyfin_items.js [--recent]

const { argv, env } = process;

function usage() {
  console.log('Usage: JELLYFIN_URL=<url> JELLYFIN_API_KEY=<key> node scripts/fetch_jellyfin_items.js [--recent]');
  process.exit(1);
}

const baseUrlRaw = env.JELLYFIN_URL;
const apiKey = env.JELLYFIN_API_KEY;
if (!baseUrlRaw || !apiKey) {
  console.error('Error: JELLYFIN_URL and JELLYFIN_API_KEY environment variables are required.');
  usage();
}

const recentOnly = argv.includes('--recent');
const baseUrl = baseUrlRaw.replace(/\/+$/, '');
const jellyfinHeaders = { 'X-Emby-Token': apiKey };

const baseItemsQuery = 'IncludeItemTypes=Movie,Series,Season,Episode,Audio,MusicAlbum,Book,BoxSet&Recursive=true&Fields=ProviderIds,PremiereDate,DateCreated,Genres,MediaSources,ParentId,People,Studios';

async function fetchWithRetry(url, options = {}, timeout = 30000, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      if (!res.ok && [500, 502, 503, 504].includes(res.status)) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      clearTimeout(id);
      const isAbort = err && err.name === 'AbortError';
      const msg = isAbort ? `Timeout (${timeout}ms)` : (err && err.message) || String(err);
      console.warn(`[fetchWithRetry] Attempt ${i + 1}/${maxRetries} failed for ${url.split('?')[0]}: ${msg}`);
      if (i === maxRetries - 1) throw err;
      await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw new Error('Max retries exceeded');
}

async function run() {
  console.log(`[debug] Fetching Jellyfin items from ${baseUrl} (recentOnly=${recentOnly})`);

  let minDateParam = '';
  if (recentOnly) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    minDateParam = `&MinDateCreated=${sevenDaysAgo.toISOString()}&SortBy=DateCreated&SortOrder=Descending`;
  }

  const DEFAULT_PAGE_SIZE = 200;
  const SLOW_PAGE_SIZE = 50;
  const SLOW_START_THRESHOLD = 2000;

  const items = [];
  let startIndex = 0;
  while (true) {
    const currentPageSize = startIndex >= SLOW_START_THRESHOLD ? SLOW_PAGE_SIZE : DEFAULT_PAGE_SIZE;
    const timeoutMs = startIndex >= SLOW_START_THRESHOLD ? 120000 : 60000;
    const retries = startIndex >= SLOW_START_THRESHOLD ? 6 : 4;
    const pageUrl = `${baseUrl}/Items?${baseItemsQuery}${minDateParam}&StartIndex=${startIndex}&Limit=${currentPageSize}`;
    console.log(`[debug] Fetching page StartIndex=${startIndex} Limit=${currentPageSize} timeout=${timeoutMs} retries=${retries}`);
    const res = await fetchWithRetry(pageUrl, { headers: jellyfinHeaders, method: 'GET' }, timeoutMs, retries);
    const json = await res.json();
    const pageItems = json.Items || [];
    console.log(`[debug] Received ${pageItems.length} items (StartIndex=${startIndex})`);
    items.push(...pageItems);
    if (pageItems.length < currentPageSize) break;
    startIndex += currentPageSize;
    if (startIndex >= 50000) {
      console.warn('[debug] Reached safety StartIndex ceiling (50000) — stopping');
      break;
    }
  }

  console.log(`[result] Total items fetched: ${items.length}`);

  // Optional lightweight summary
  const genres = new Map();
  let totalDurationMs = 0;
  for (const it of items) {
    (it.Genres || []).forEach(g => genres.set(g, (genres.get(g) || 0) + 1));
    if (it.RunTimeTicks) totalDurationMs += Math.floor(Number(it.RunTimeTicks) / 10000);
  }
  const uniqueGenres = genres.size;
  const avgDurationMin = items.length ? Math.round((totalDurationMs / items.length) / 60000) : 0;

  console.log('[summary] Unique genres:', uniqueGenres);
  console.log('[summary] Top genres:');
  [...genres.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([g,c])=>console.log(`  ${g}: ${c}`));
  console.log('[summary] Avg duration (min):', avgDurationMin);

  console.log('[done] fetch complete');
}

run().catch((err)=>{ console.error('[error] fetch_jellyfin_items failed:', err); process.exit(2); });
