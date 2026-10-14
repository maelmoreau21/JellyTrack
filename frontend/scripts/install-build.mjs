import { cp, mkdir, readFile, writeFile, readdir, rm, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const workspace = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const source = path.join(workspace, 'frontend', 'build');
const target = path.join(workspace, 'web', 'svelte');
if (path.relative(workspace, target) !== path.join('web', 'svelte')) throw new Error('Unexpected frontend destination');
const html = await readFile(path.join(source, 'index.html'), 'utf8');
if (!html.includes('/_app/') || !html.includes('JellyTrack')) throw new Error('The SvelteKit build is missing or invalid');
for (const candidate of [path.join(workspace, 'web'), target]) {
  const info = await lstat(candidate).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (info?.isSymbolicLink()) throw new Error('Refusing a symlink frontend destination');
}
// Only the verified, generated frontend directory is replaced. Neither the Go
// reference nor application data is part of this operation.
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true, filter: name => !name.endsWith('.map') });
const files = {};
async function inventory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) await inventory(name);
    else files[path.relative(target, name).split(path.sep).join('/')] = createHash('sha256').update(await readFile(name)).digest('hex');
  }
}
await inventory(target);
const pkg = JSON.parse(await readFile(path.join(workspace, 'frontend', 'package.json'), 'utf8'));
await writeFile(path.join(target, 'frontend-manifest.json'), JSON.stringify({ framework: 'SvelteKit', version: pkg.devDependencies['@sveltejs/kit'], files }, null, 2));
console.log(`Installed ${Object.keys(files).length} verified frontend files for the Go embed`);
