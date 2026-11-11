import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const worker = path.join(root, 'node_modules/@ffmpeg/ffmpeg/dist/esm/worker.js');
const source = await readFile(worker, 'utf8');
const next = source.replace(
  'await import(\n        /* @vite-ignore */ _coreURL)',
  'await import(\n        /* webpackIgnore: true */\n        /* @vite-ignore */ _coreURL)',
);
if (next === source) {
  if (source.includes('webpackIgnore: true')) {
    console.log('ffmpeg worker already ignores webpack for the core import');
  } else {
    throw new Error('Could not patch the ffmpeg worker import.');
  }
} else {
  await writeFile(worker, next);
  console.log('patched ffmpeg worker to load the core outside webpack');
}
