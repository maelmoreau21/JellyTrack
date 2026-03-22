/* eslint-disable @typescript-eslint/no-require-imports */
const http = require('http');
const https = require('https');

function fetchStatus(url, redirectsLeft = 5) {
  return new Promise((resolve) => {
    try {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.get(url, (res) => {
        const status = res.statusCode;
        if (status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
          const loc = res.headers.location;
          const nextUrl = new URL(loc, url).href;
          res.resume();
          resolve(fetchStatus(nextUrl, redirectsLeft - 1));
        } else {
          resolve(status);
          res.resume();
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
  const urls = ['http://localhost:3001/','http://localhost:3001/media','http://localhost:3001/logs','http://localhost:3001/settings','http://localhost:3001/users'];
  for (const u of urls) {
    const s = await fetchStatus(u);
    console.log(`${u} -> ${s}`);
  }
})();
