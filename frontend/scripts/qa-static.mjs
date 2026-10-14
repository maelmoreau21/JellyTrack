import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
export function serveStatic(root) {
  return createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      const file = pathname.startsWith('/assets/') || pathname.startsWith('/_app/') ? pathname.slice(1) : 'index.html';
      if (file.includes('..')) throw new Error('Invalid path');
      const data = await readFile(new URL(file, root));
      const type = file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.json') ? 'application/json' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream';
      response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
      response.writeHead(200, { 'Content-Type': type }); response.end(data);
    } catch { response.writeHead(404); response.end(); }
  });
}
