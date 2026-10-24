import Ajv from 'ajv/dist/2020.js';
import { readFileSync, readdirSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const schema = JSON.parse(readFileSync(new URL('./schema.json', import.meta.url)));
const validate = new Ajv({ allErrors: true }).compile(schema);
const catalogSchema = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'title', 'platform', 'repo', 'tier'],
    properties: {
      id: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
      title: { type: 'string', minLength: 1, pattern: '^(?!\\s*$)(?![\\s\\S]*(?:```|~~~))[\\s\\S]+$' },
      platform: { type: 'string', minLength: 1, pattern: '^(?!\\s*$)(?![\\s\\S]*(?:```|~~~))[\\s\\S]+$' },
      repo: { type: 'string', minLength: 1, pattern: '^(?!\\s*$)(?![\\s\\S]*(?:```|~~~))[\\s\\S]+$' },
      tier: { type: 'integer', enum: [1, 2] },
    },
  },
};
const validateCatalogRows = new Ajv({ allErrors: true }).compile(catalogSchema);
function unique(ids) {
  if (new Set(ids).size !== ids.length) throw new Error('duplicate ids');
}
function sourcePath(value) {
  if (path.isAbsolute(value) || value.split(/[\\/]/u).includes('..') || !/^[a-zA-Z0-9_./-]+$/u.test(value))
    throw new Error(`unsafe source path: ${value}`);
}
export function validateCatalog(catalog, games, stubs = []) {
  if (!validateCatalogRows(catalog)) throw new Error(JSON.stringify(validateCatalogRows.errors));
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
  if (!validate(game)) throw new Error(JSON.stringify(validate.errors));
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
  const games = readdirSync('.').filter(name => /^game-.*\.json$/u.test(name)).map(name => validateGame(JSON.parse(readFileSync(name))));
  if (!games.length) throw new Error('no games');
  for (const game of games) {
    const sourceFlag = args.indexOf('--source');
    const source = sourceFlag >= 0 ? args[sourceFlag + 1] : path.resolve('.sources', game.id);
    if (!source) throw new Error('missing --source path');
    if (sourceFlag < 0) {
      if (!existsSync(source)) { mkdirSync(source, { recursive: true }); execFileSync('git', ['init', '--bare', source]); }
      execFileSync('git', ['-C', source, 'fetch', '--depth=1', game.repo, game.sha], { stdio: 'inherit' });
    }
    verifySources(game, source);
    console.log(`${game.id}@${game.sha}: ${game.nodes.length} nodes, ${game.cards.length} cards, all pinned source checks passed`);
  }
  if (games.find(game => game.id === 'sm64')?.cards.length < 10) throw new Error('SM64 needs at least 10 cards');
  if (args.includes('--release')) {
    const catalog = JSON.parse(readFileSync('catalog.json'));
    const stubs = games.flatMap(game => [
      ...game.nodes.map(node => ({ id: node.id, game: game.id, kind: 'node', name: node.name, summary: node.purpose, tags: [], capabilities: [] })),
      ...game.cards.map(card => ({ id: card.id, game: game.id, kind: 'card', name: card.name, summary: card.summary, tags: card.tags, capabilities: card.capabilities })),
    ]);
    validateCatalog(catalog, games, stubs);
    mkdirSync('.release', { recursive: true });
    writeFileSync('.release/index.json.gz', gzipSync(JSON.stringify({ version: 1, games: catalog, stubs })));
    for (const game of games) writeFileSync(`.release/game-${game.id}.json`, JSON.stringify(game));
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
