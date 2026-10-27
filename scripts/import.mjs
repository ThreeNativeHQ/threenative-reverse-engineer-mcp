// Tier-2 import: one catalog row per project in the Greatest Games Decompilations List README.
// Usage: npm run import -- <README.md>   (rewrites data/catalog.json; existing rows keep their id and tier)
import { readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical, loadLibrary, platforms, validateCatalog } from './validate.mjs';

// The first link is the project; a ✦ marker and extra " · [link]" mirrors are ignored.
const ROW = /^- \*\*(.+?)\*\*(?: ✦)? — \[[^\]]+\]\((https:\/\/[^)\s]+)\)(.*)$/u;
const NOTE = / — \*(.*)\*\s*$/u;
const repoKey = url => url.toLowerCase().replace(/(?:\.git)?\/*$/u, '');
const slug = text => text.normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '');

// Project kind comes from the list's own note; a note that only comments on the project
// (version, expansion, AI-assisted) keeps the decompilation default.
const KIND_RULES = [
  [/^Static recompilation\b/u, 'static-recompilation'],
  [/^Disassembly\b/u, 'disassembly'],
  [/^Genesis disassembly\b/u, 'disassembly'],
  [/^Engine reimplementation\b/u, 'engine-reimplementation'],
  [/^Open-source .*reimplementation\b/u, 'engine-reimplementation'],
  [/^Reversed reimplementation\b/u, 'engine-reimplementation'],
  [/^Reverse-engineered .*port\b/u, 'port'],
  [/^Source port\b/u, 'source-port'],
  [/^Browser port\b/u, 'browser-port'],
  [/^Native PC port\b/u, 'port'],
  [/^Port\b/u, 'port'],
];

export function classify(section, note) {
  const named = /^[^,]+, ([^.]+)\./u.exec(note)?.[1].trim();
  const platform = named && platforms.has(named) ? named : platforms.has(section) ? section : 'unknown';
  const kind = section === 'System software and emulators' ? 'system-software'
    : KIND_RULES.find(([pattern]) => pattern.test(note))?.[1] ?? 'decompilation';
  return { platform, kind };
}

export function importList(readme, existing) {
  const rows = [...existing];
  const byRepo = new Set(existing.map(row => repoKey(row.repo)));
  const ids = new Set(existing.map(row => row.id));
  let section = '';
  let found = 0;
  for (const line of readme.split('\n')) {
    if (line.startsWith('## ')) section = line.slice(3).trim();
    const match = ROW.exec(line);
    if (!match) continue;
    found++;
    const [, title, repo, rest] = match;
    const note = NOTE.exec(rest)?.[1] ?? '';
    if (byRepo.has(repoKey(repo))) continue;
    byRepo.add(repoKey(repo));
    const [owner, name] = new URL(repo).pathname.split('/').filter(Boolean);
    const base = slug(title) || slug(name ?? '') || 'game';
    let id = ids.has(base) ? `${base}-${slug(owner ?? '')}` : base;
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
    ids.add(id);
    const { platform, kind } = classify(section, note);
    rows.push({ id, title, platform, repo, tier: 2, kind });
  }
  if (found === 0) throw new Error('the list holds no projects');
  return rows;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!process.argv[2]) throw new Error('usage: npm run import -- <README.md>');
    const { catalog, games } = loadLibrary();
    const rows = importList(readFileSync(process.argv[2], 'utf8'), catalog);
    validateCatalog(rows, games);
    const root = fileURLToPath(new URL('..', import.meta.url));
    const target = path.join(root, 'data', 'catalog.json');
    const candidate = path.join(root, 'data', `.catalog.${process.pid}.json`);
    try {
      writeFileSync(candidate, canonical(rows));
      renameSync(candidate, target);
    } finally {
      rmSync(candidate, { force: true });
    }
    console.log(`catalog: ${catalog.length} -> ${rows.length} rows`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
