import { cp, mkdir, rm } from 'node:fs/promises';

const output = new URL('../public/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ['index.html', 'script.js', 'style.css']) await cp(new URL(`../${file}`, import.meta.url), new URL(file, output));
console.log('Built public/ with 3 approved static assets.');
