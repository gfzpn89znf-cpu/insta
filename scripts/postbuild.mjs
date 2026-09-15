/**
 * Traegt nach dem Build die tatsaechlichen Dateinamen in den Service Worker
 * ein. Die Namen enthalten einen Hash und aendern sich mit jedem Build -
 * deshalb koennen sie nicht fest in sw.js stehen.
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const DIST = 'dist';

function collect(dir, prefix = '') {
  const out = [];
  for (const entry of readdirSync(join(DIST, dir), { withFileTypes: true })) {
    const rel = `${prefix}${entry.name}`;
    if (entry.isDirectory()) out.push(...collect(join(dir, entry.name), `${rel}/`));
    else out.push(`${dir === '.' ? '' : `${dir}/`}${entry.name}`);
  }
  return out;
}

const files = [
  ...collect('assets'),
  ...collect('icons'),
].map((f) => `./${f}`);

const swPath = join(DIST, 'sw.js');
const sw = readFileSync(swPath, 'utf8');

// Versionskennung aus dem Inhalt: aendert sich etwas, wird der alte
// Zwischenspeicher verworfen.
const hash = createHash('sha1');
for (const file of files.sort()) {
  hash.update(file);
  hash.update(String(statSync(join(DIST, file.slice(2))).size));
}
const buildId = hash.digest('hex').slice(0, 10);

const patched = sw
  .replace("'__PRECACHE_ASSETS__'", JSON.stringify(files))
  .replace('__BUILD_ID__', buildId);

if (patched === sw) throw new Error('Platzhalter im Service Worker nicht gefunden');
writeFileSync(swPath, patched);
console.log(`Service Worker: ${files.length} Dateien vorgemerkt, Version ${buildId}`);
