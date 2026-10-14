import { mkdir, copyFile } from 'node:fs/promises';
// The application template is owned by SvelteKit. Public styles, fonts, icons
// and translations are canonical static sources, never generated from web/dist.
await mkdir(new URL('../static/', import.meta.url), { recursive: true });
await copyFile(new URL('../src/document.html', import.meta.url), new URL('../src/app.html', import.meta.url));
