import { access, copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public', 'tesseract');
const langUrls = [
  'https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0/eng.traineddata.gz',
  'https://github.com/naptha/tessdata/raw/gh-pages/4.0.0/eng.traineddata.gz',
];

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  if (!(await exists(dir))) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

async function copyWorker() {
  const candidates = [
    path.join(root, 'node_modules/tesseract.js/dist/worker.min.js'),
    path.join(root, 'node_modules/tesseract.js/dist/worker.min.mjs'),
  ];
  const source = await Promise.all(candidates.map(async (file) => ((await exists(file)) ? file : null)));
  const found = source.find(Boolean);
  if (!found) {
    throw new Error(`Could not find a tesseract.js worker. Looked in:\n${candidates.join('\n')}`);
  }
  await copyFile(found, path.join(pub, 'worker.min.js'));
  console.log(`worker ${path.basename(found)}`);
}

async function copyCore() {
  const roots = [
    path.join(root, 'node_modules/tesseract.js-core'),
    path.join(root, 'node_modules/tesseract.js/node_modules/tesseract.js-core'),
  ];
  const files = [];
  for (const dir of roots) {
    for (const file of await walk(dir)) {
      const name = path.basename(file);
      if (!name.includes('tesseract-core')) continue;
      if (name.endsWith('.map') || name.endsWith('.ts')) continue;
      files.push(file);
    }
  }
  if (files.length === 0) {
    throw new Error('Could not find tesseract.js-core wasm files in node_modules.');
  }
  const destDir = path.join(pub, 'core');
  await mkdir(destDir, { recursive: true });
  const seen = new Set();
  for (const file of files) {
    const name = path.basename(file);
    if (seen.has(name)) continue;
    seen.add(name);
    await copyFile(file, path.join(destDir, name));
    console.log(`core ${name}`);
  }
}

async function downloadLanguage() {
  const dest = path.join(pub, 'lang', 'eng.traineddata.gz');
  await mkdir(path.dirname(dest), { recursive: true });
  if (await exists(dest)) {
    console.log('language file already present');
    return;
  }
  let lastError = null;
  for (const url of langUrls) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} from ${url}`);
      const buf = Buffer.from(await response.arrayBuffer());
      if (buf.length < 500_000 || buf[0] !== 0x1f || buf[1] !== 0x8b) {
        throw new Error(`Unexpected language file from ${url} (${buf.length} bytes)`);
      }
      await writeFile(dest, buf);
      console.log(`language ${buf.length} bytes`);
      return;
    } catch (error) {
      lastError = error;
      console.warn(String(error));
    }
  }
  throw lastError ?? new Error('Could not download eng.traineddata.gz');
}

await mkdir(pub, { recursive: true });
await copyWorker();
await copyCore();
await downloadLanguage();
