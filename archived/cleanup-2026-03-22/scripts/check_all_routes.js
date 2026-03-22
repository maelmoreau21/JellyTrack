/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const https = require('https');

const APP_DIR = path.join(process.cwd(), 'src', 'app');
const BASE = process.env.BASE_URL || 'http://localhost:3001';

async function walk(dir) {
  let results = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      results = results.concat(await walk(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

function isDynamicRoute(segment) {
  return /\[.+\]/.test(segment);
}

function pageFileToRoute(file) {
  const rel = path.relative(APP_DIR, file).replace(/\\/g, '/');
  if (!/page\.(t|j)sx?$/.test(rel)) return null;
  const dir = path.dirname(rel);
  if (!dir || dir === '.') return '/';
  const parts = dir.split('/');
  if (parts.some(isDynamicRoute)) return null; // skip dynamic
  return '/' + parts.join('/');
}

function routeFileToRoute(file) {
  const rel = path.relative(APP_DIR, file).replace(/\\/g, '/');
  if (!/route\.(t|j)sx?$/.test(rel)) return null;
  const dir = path.dirname(rel);
  const parts = dir.split('/');
  if (parts.some(isDynamicRoute)) return null;
  return '/' + parts.join('/');
}

function fetchStatus(url, redirectsLeft = 5) {
  return new Promise((resolve) => {
    try {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.get(url, (res) => {
        const status = res.statusCode;
        if (status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
          const nextUrl = new URL(res.headers.location, url).href;
          res.resume();
          resolve(fetchStatus(nextUrl, redirectsLeft - 1));
        } else {
          res.resume();
          resolve(status);
        }
      });
      req.on('error', (err) => resolve('ERROR: ' + err.message));
      req.setTimeout(10000, () => { req.abort(); resolve('ERROR: timeout'); });
    } catch (e) {
      resolve('ERROR: ' + (e && e.message ? e.message : String(e)));
    }
  });
}

(async () => {
  console.log('[check_all_routes] Scanning src/app for pages and routes...');
  const allFiles = await walk(APP_DIR);
  const routesSet = new Set();

  for (const f of allFiles) {
    const pr = pageFileToRoute(f);
    if (pr) routesSet.add(pr);
    const rr = routeFileToRoute(f);
    if (rr) routesSet.add(rr);
  }

  // Ensure root is present
  routesSet.add('/');

  const routes = Array.from(routesSet).sort();
  console.log(`[check_all_routes] Found ${routes.length} candidate routes (non-dynamic).`);

  const results = [];
  for (const r of routes) {
    const u = new URL(r, BASE).href;
    const status = await fetchStatus(u);
    console.log(`${u} -> ${status}`);
    results.push({ route: r, url: u, status });
  }

  // Also test some common API GET endpoints derived from /src/app/api
  console.log('\n[check_all_routes] Summary:');
  const ok = results.filter(r => typeof r.status === 'number' && r.status >= 200 && r.status < 400).length;
  console.log(`  OK: ${ok}/${results.length}`);
  const failed = results.filter(r => !(typeof r.status === 'number' && r.status >= 200 && r.status < 400));
  if (failed.length > 0) {
    console.log('  Non-2xx/3xx results:');
    failed.forEach(f => console.log(`    ${f.url} -> ${f.status}`));
  }

  process.exit(0);
})();
