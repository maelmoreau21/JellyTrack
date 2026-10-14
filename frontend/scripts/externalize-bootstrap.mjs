import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Keep the Go server's script-src 'self' policy: no inline bootstrap exemption.
const index = new URL('../build/index.html', import.meta.url);
let html = await readFile(index, 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (scripts.length !== 1 || !scripts[0][1].includes('document.currentScript.parentElement')) {
  throw new Error('SvelteKit bootstrap changed; review CSP packaging.');
}
const content = scripts[0][1];
const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
const file = `jellytrack-start.${hash}.js`;
await writeFile(new URL(`../build/_app/${file}`, import.meta.url), content);
html = html.replace(scripts[0][0], `<script src="/_app/${file}"></script>`);
if (/<script(?![^>]*\bsrc=)/.test(html)) throw new Error('Inline script remains in static build.');
await writeFile(index, html);
