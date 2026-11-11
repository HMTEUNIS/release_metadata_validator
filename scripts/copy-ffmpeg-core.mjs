import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'node_modules/@ffmpeg/core/dist/esm');
const target = path.join(root, 'public/ffmpeg-core');

await mkdir(target, { recursive: true });
await copyFile(path.join(source, 'ffmpeg-core.js'), path.join(target, 'ffmpeg-core.js'));
await copyFile(path.join(source, 'ffmpeg-core.wasm'), path.join(target, 'ffmpeg-core.wasm'));
console.log('copied ffmpeg core into public/ffmpeg-core');
