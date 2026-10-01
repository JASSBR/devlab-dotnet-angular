/**
 * Build-time snapshot of every source file referenced by the lesson catalog.
 * In production the backend may not be deployed: the code viewer falls back to
 * this JSON so lessons still show the real code. Run automatically before `ng build`.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const out = join(here, '../public/source-snapshot.json');

// On Vercel only the frontend folder is uploaded: there is no backend/ to read.
// The snapshot committed in public/ is then used as-is.
if (!existsSync(join(repoRoot, 'backend'))) {
  console.log(`source snapshot: backend/ not present, keeping ${existsSync(out) ? 'the committed snapshot' : 'NOTHING (code viewer will be empty!)'}`);
  process.exit(existsSync(out) ? 0 : 1);
}

const catalog = readFileSync(join(repoRoot, 'frontend/src/app/lessons/catalog.ts'), 'utf8');

// The catalog builds paths with two template prefixes; resolve them the same way.
const FE = 'frontend/src/app';
const BE = 'backend/DevLab.Api';
const paths = new Set();
for (const m of catalog.matchAll(/[`']([^`'$]*\$\{(FE|BE)\}[^`']*|(?:frontend|backend)\/[^`']*)[`']/g)) {
  const raw = m[1];
  const path = raw.replace('${FE}', FE).replace('${BE}', BE);
  if (path === FE || path === BE) continue;   // the prefix constants themselves, not files
  paths.add(path);
}

const languageFor = p => {
  if (p.endsWith('.editorconfig')) return 'ini';
  return { '.cs': 'csharp', '.ts': 'typescript', '.html': 'xml', '.scss': 'scss', '.css': 'scss',
           '.json': 'json', '.csproj': 'xml', '.props': 'xml' }[extname(p)] ?? 'plaintext';
};

const snapshot = {};
let missing = 0;
for (const p of [...paths].sort()) {
  try {
    snapshot[p] = { path: p, language: languageFor(p), content: readFileSync(join(repoRoot, p), 'utf8') };
  } catch {
    missing++;
    console.warn(`  ! missing: ${p}`);
  }
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(snapshot));
const kb = Math.round(Buffer.byteLength(JSON.stringify(snapshot)) / 1024);
console.log(`source snapshot: ${Object.keys(snapshot).length} files, ${kb} kB${missing ? `, ${missing} missing` : ''}`);
if (missing) process.exitCode = 1;   // a lesson pointing at a deleted file must fail the build
