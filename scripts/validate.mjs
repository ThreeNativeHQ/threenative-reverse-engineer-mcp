import Ajv from 'ajv/dist/2020.js';
import { readFileSync, readdirSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const ajv = new Ajv({ allErrors: true });
const readSchema = name => JSON.parse(readFileSync(new URL(`../schemas/${name}`, import.meta.url)));
const validateGameDocument = ajv.compile(readSchema('game.schema.json'));
const validateCatalogDocument = ajv.compile(readSchema('catalog.schema.json'));

export const canonical = value => `${JSON.stringify(value, null, 2)}\n`;

function unique(ids) {
  if (new Set(ids).size !== ids.length) throw new Error('duplicate ids');
}
function sourcePath(value) {
  if (path.isAbsolute(value) || value.split(/[\\/]/u).includes('..') || !/^[a-zA-Z0-9_./-]+$/u.test(value))
    throw new Error(`unsafe source path: ${value}`);
}
export function validateCatalog(catalog, games, stubs = []) {
  if (!validateCatalogDocument(catalog)) throw new Error(JSON.stringify(validateCatalogDocument.errors));
  unique(catalog.map(row => row.id));
  const rows = new Map(catalog.map(row => [row.id, row]));
  const gameIdList = games.map(game => game.id);
  unique(gameIdList);
  const gameIds = new Set(gameIdList);
  for (const id of gameIds) {
    const row = rows.get(id);
    if (!row) throw new Error(`game ${id} absent from catalog`);
    if (row.tier !== 1) throw new Error(`game ${id} needs a tier 1 catalog row`);
  }
  for (const row of catalog)
    if (row.tier === 1 && !gameIds.has(row.id)) throw new Error(`tier 1 ${row.id} has no game file`);
  for (const stub of stubs)
    if (!rows.has(stub.game)) throw new Error(`stub ${stub.id} references missing game ${stub.game}`);
  return catalog;
}
export function validateGame(game) {
  if (!validateGameDocument(game)) throw new Error(JSON.stringify(validateGameDocument.errors));
  unique(game.nodes.map(node => node.id));
  unique(game.cards.map(card => card.id));
  const nodes = new Map(game.nodes.map(node => [node.id, node]));
  for (const node of game.nodes) {
    for (const file of [...node.paths, ...node.functions.map(fn => fn.path)]) sourcePath(file);
    for (const fn of node.functions) if (fn.lines[1] < fn.lines[0]) throw new Error('reversed function range');
    for (const dependency of node.dependsOn) if (!nodes.has(dependency)) throw new Error(`missing node ${dependency}`);
    const seen = new Set([node.id]);
    let parent = node.parent;
    while (parent !== undefined) {
      if (seen.has(parent) || !nodes.has(parent)) throw new Error(`cyclic or missing parent ${parent}`);
      seen.add(parent); parent = nodes.get(parent).parent;
    }
  }
  for (const card of game.cards) {
    if (!nodes.has(card.node) || card.sources.length === 0) throw new Error(`missing card node or sources: ${card.id}`);
    for (const source of card.sources) sourcePath(source.path);
    for (const constant of card.constants) {
      const match = /^(.*):([1-9][0-9]*)$/u.exec(constant.source);
      if (!match) throw new Error(`unpinned constant source: ${constant.source}`);
      sourcePath(match[1]);
    }
  }
  return game;
}
function read(name) {
  const text = readFileSync(path.join(root, name), 'utf8');
  return { name, text, value: JSON.parse(text) };
}
export function loadLibrary() {
  for (const name of readdirSync(root))
    if (name === 'catalog.json' || /^game-.*\.json$/u.test(name))
      throw new Error(`legacy root data ${name}: authored data lives under data/`);
  if (!existsSync(path.join(root, 'data', 'games'))) throw new Error('missing data/games directory');
  const docs = readdirSync(path.join(root, 'data', 'games'))
    .filter(name => name.endsWith('.json'))
    .sort()
    .map(name => read(path.join('data', 'games', name)));
  if (!docs.length) throw new Error('no games');
  const games = docs.map(doc => {
    validateGame(doc.value);
    const name = path.basename(doc.name, '.json');
    if (doc.value.id !== name) throw new Error(`game file ${doc.name} holds id ${doc.value.id}: rename it to ${doc.value.id}.json`);
    return doc.value;
  });
  const catalog = read(path.join('data', 'catalog.json'));
  validateCatalog(catalog.value, games);
  for (const doc of [...docs, catalog])
    if (doc.text !== canonical(doc.value))
      throw new Error(`noncanonical JSON in ${doc.name}: write JSON.stringify(value, null, 2) plus one trailing newline`);
  return { catalog: catalog.value, games };
}
function verifySources(game, source) {
  const lines = new Map();
  function file(name) {
    if (!lines.has(name)) lines.set(name, execFileSync('git', ['-C', source, 'show', `${game.sha}:${name}`], { encoding: 'utf8', maxBuffer: 16_000_000 }).split('\n'));
    return lines.get(name);
  }
  function line(name, number) {
    const value = file(name)[number - 1];
    if (value === undefined) throw new Error(`missing line ${name}:${number}`);
    return value;
  }
  for (const node of game.nodes) {
    for (const name of node.paths) file(name);
    for (const fn of node.functions) {
      if (!line(fn.path, fn.lines[0]).includes(fn.name)) throw new Error(`missing function start ${fn.name}`);
      line(fn.path, fn.lines[1]);
    }
  }
  if (game.id === 'sm64') {
    const sourceFiles = execFileSync('git', ['-C', source, 'ls-tree', '-r', '--name-only', game.sha, 'src'], { encoding: 'utf8' }).trim().split('\n').filter(name => name.endsWith('.c'));
    const mapped = new Set(game.nodes.flatMap(node => node.paths));
    const missing = sourceFiles.filter(name => !mapped.has(name));
    if (missing.length) throw new Error(`incomplete source map: ${missing.length} unmapped C files; first ${missing[0]}`);
  }
  for (const card of game.cards) {
    for (const source of card.sources) line(source.path, source.line);
    for (const constant of card.constants) {
      const [, name, number] = /^(.*):([1-9][0-9]*)$/u.exec(constant.source);
      const value = line(name, Number(number));
      const literals = value.match(/-?\d+(?:\.\d+)?/gu)?.map(Number) ?? [];
      if (typeof constant.value === 'number' ? !literals.includes(constant.value) : !value.includes(constant.value))
        throw new Error(`constant ${constant.name}=${constant.value} absent at ${constant.source}`);
    }
  }
}
export function run(args = process.argv.slice(2)) {
  const flag = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  const gameId = flag('--game');
  if (args.includes('--game') && !gameId) throw new Error('missing --game id');
  const source = flag('--source');
  if (args.includes('--source') && !source) throw new Error('missing --source path');
  const { catalog, games } = loadLibrary();
  const selected = gameId === undefined ? games : games.filter(game => game.id === gameId);
  if (!selected.length) throw new Error(`no game file for ${gameId}`);
  if (args.includes('--data-only')) {
    console.log(`data: ${catalog.length} catalog rows and ${games.length} games are canonical and consistent`);
    return;
  }
  for (const game of selected) {
    const checkout = source ?? path.join(root, '.sources', game.id);
    if (source === undefined) {
      if (!existsSync(checkout)) { mkdirSync(checkout, { recursive: true }); execFileSync('git', ['init', '--bare', checkout]); }
      execFileSync('git', ['-C', checkout, 'fetch', '--depth=1', game.repo, game.sha], { stdio: 'inherit' });
    }
    verifySources(game, checkout);
    console.log(`${game.id}@${game.sha}: ${game.nodes.length} nodes, ${game.cards.length} cards, all pinned source checks passed`);
  }
  if (games.find(game => game.id === 'sm64')?.cards.length < 10) throw new Error('SM64 needs at least 10 cards');
  if (args.includes('--release')) {
    const stubs = games.flatMap(game => [
      ...game.nodes.map(node => ({ id: node.id, game: game.id, kind: 'node', name: node.name, summary: node.purpose, tags: [], capabilities: [] })),
      ...game.cards.map(card => ({ id: card.id, game: game.id, kind: 'card', name: card.name, summary: card.summary, tags: card.tags, capabilities: card.capabilities })),
    ]);
    validateCatalog(catalog, games, stubs);
    mkdirSync(path.join(root, '.release'), { recursive: true });
    writeFileSync(path.join(root, '.release', 'index.json.gz'), gzipSync(JSON.stringify({ version: 1, games: catalog, stubs })));
    for (const game of games) writeFileSync(path.join(root, '.release', `game-${game.id}.json`), JSON.stringify(game));
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { run(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
