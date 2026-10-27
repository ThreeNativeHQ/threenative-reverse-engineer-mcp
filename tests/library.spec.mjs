import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { validateGame } from '../scripts/validate.mjs';
import { catalogRow, cleanup, demoGame, makeLibrary, makeSourceRepo, root, runNode, runNpm, write } from './support.mjs';

const SHA = 'a'.repeat(40);

test('the tracked library keeps the canonical layout and no legacy root files', () => {
  const tracked = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).stdout.trim().split('\n');
  const legacy = tracked.filter(name => /^(?:catalog\.json|schema\.json|test-fixture\.json|validate\.mjs|import\.mjs|game-.*\.json|[^/]*\.spec\.mjs)$/u.test(name) || name.startsWith('scout/'));
  assert.deepEqual(legacy, []);
  for (const name of [
    'data/catalog.json',
    'data/games/oot.json',
    'data/games/openra.json',
    'data/games/quake.json',
    'data/games/sm64.json',
    'data/games/super-metroid-sm.json',
    'schemas/game.schema.json',
    'schemas/catalog.schema.json',
    'scripts/validate.mjs',
    'scripts/import.mjs',
    'scripts/scout/run.sh',
    'scripts/scout/BRIEF.md',
    'tests/fixtures/game.json',
    'tests/library.spec.mjs',
  ]) assert.ok(tracked.includes(name), name);
});

test('check:data accepts the tracked dataset offline', t => {
  const dir = makeLibrary({ copyData: true });
  t.after(() => cleanup(dir));
  const result = runNpm(dir, ['check:data']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\d+ catalog rows and 5 games are canonical and consistent/);
  assert.equal(readdirSync(path.join(dir, 'data', 'games')).length, 5);
});

const faults = [
  ['legacy root catalog', dir => writeFileSync(path.join(dir, 'catalog.json'), '[]\n'), /legacy root data catalog\.json/],
  ['legacy root game', dir => writeFileSync(path.join(dir, 'game-extra.json'), '{}\n'), /legacy root data game-extra\.json/],
  ['duplicate catalog ids', dir => write(dir, 'data/catalog.json', [catalogRow(), { ...catalogRow(), title: 'Duplicate' }]), /duplicate ids/],
  ['filename/id disagreement', dir => renameSync(path.join(dir, 'data/games/demo.json'), path.join(dir, 'data/games/other.json')), /holds id demo/],
  ['tier 1 row without a game file', dir => write(dir, 'data/catalog.json', [catalogRow(), catalogRow('ghost')]), /tier 1 ghost has no game file/],
  ['game without a catalog row', dir => write(dir, 'data/catalog.json', []), /game demo absent from catalog/],
  ['game with only a tier 2 row', dir => write(dir, 'data/catalog.json', [{ ...catalogRow(), tier: 2 }]), /game demo needs a tier 1 catalog row/],
  ['broken card link', dir => write(dir, 'data/games/demo.json', { ...demoGame(SHA), cards: [{ ...demoGame(SHA).cards[0], node: 'missing' }] }), /missing card node or sources/],
  ['source path traversal', dir => write(dir, 'data/games/demo.json', { ...demoGame(SHA), nodes: demoGame(SHA).nodes.map((node, index) => index ? node : { ...node, paths: ['../secret'] }) }), /unsafe source path/],
  ['unknown field', dir => write(dir, 'data/games/demo.json', { ...demoGame(SHA), code: 'bad' }), /additionalProperties/],
  ['wrong field type', dir => write(dir, 'data/catalog.json', [{ ...catalogRow(), tier: '1' }]), /tier/],
  ['noncanonical formatting', dir => writeFileSync(path.join(dir, 'data/catalog.json'), `${JSON.stringify([catalogRow()], null, 4)}\n`), /noncanonical JSON/],
];

for (const [name, damage, expected] of faults) {
  test(`check:data fails on ${name}`, t => {
    const dir = makeLibrary({ games: [demoGame(SHA)] });
    t.after(() => cleanup(dir));
    damage(dir);
    const result = runNode(dir, ['scripts/validate.mjs', '--data-only']);
    assert.notEqual(result.status, 0, `${name} passed`);
    assert.match(result.stderr, expected);
    assert.doesNotMatch(result.stderr, /Cannot find module|ERR_MODULE_NOT_FOUND/);
  });
}

test('check:data names a missing selected game', t => {
  const dir = makeLibrary({ games: [demoGame(SHA)] });
  t.after(() => cleanup(dir));
  const result = runNode(dir, ['scripts/validate.mjs', '--data-only', '--game', 'nope']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /no game file for nope/);
});

test('targeted pinned-source validation passes, and a bad citation fails', t => {
  const source = makeSourceRepo();
  const dir = makeLibrary({ catalog: [catalogRow()], games: [demoGame(source.sha)] });
  t.after(() => cleanup(dir));
  const ok = runNpm(dir, ['validate', '--', '--game', 'demo', '--source', source.dir]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, new RegExp(`demo@${source.sha}: 3 nodes, 1 cards, all pinned source checks passed`));
  write(dir, 'data/games/demo.json', {
    ...demoGame(source.sha),
    cards: [{ ...demoGame(source.sha).cards[0], constants: [{ ...demoGame(source.sha).cards[0].constants[0], value: 70 }] }],
  });
  const bad = runNpm(dir, ['validate', '--', '--game', 'demo', '--source', source.dir]);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /constant launchSpeed=70 absent/);
});

test('--game does not weaken whole-library consistency or pinned verification', t => {
  const source = makeSourceRepo();
  const dir = makeLibrary({ catalog: [catalogRow(), catalogRow('second')], games: [demoGame(source.sha), demoGame(source.sha, 'second')] });
  t.after(() => cleanup(dir));
  write(dir, 'data/games/second.json', {
    ...demoGame(source.sha, 'second'),
    cards: [{ ...demoGame(source.sha, 'second').cards[0], node: 'missing' }],
  });
  const broken = runNpm(dir, ['validate', '--', '--game', 'demo', '--source', source.dir]);
  assert.notEqual(broken.status, 0);
  assert.match(broken.stderr, /missing card node or sources/);
  write(dir, 'data/games/second.json', demoGame(source.sha, 'second'));
  const ok = runNpm(dir, ['validate', '--', '--game', 'demo', '--source', source.dir]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.doesNotMatch(ok.stdout, /second@/, 'only the selected game spends pinned-source checks');
});

test('release assets keep the version-1 contract and exact asset set', t => {
  const source = makeSourceRepo();
  const config = [catalogRow(), catalogRow('second')];
  const dir = makeLibrary({ catalog: config, games: [demoGame(source.sha), demoGame(source.sha, 'second')] });
  t.after(() => cleanup(dir));
  const result = runNpm(dir, ['release:assets', '--', '--source', source.dir]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readdirSync(path.join(dir, '.release')).sort(), ['game-demo.json', 'game-second.json', 'index.json.gz']);
  const index = JSON.parse(gunzipSync(readFileSync(path.join(dir, '.release', 'index.json.gz'))).toString());
  assert.equal(index.version, 1);
  assert.deepEqual(index.games, config);
  const game = demoGame(source.sha);
  assert.equal(readFileSync(path.join(dir, '.release', 'game-demo.json'), 'utf8'), JSON.stringify(game));
  assert.doesNotThrow(() => validateGame(JSON.parse(readFileSync(path.join(dir, '.release', 'game-demo.json'), 'utf8'))));
  const nodes = index.stubs.filter(stub => stub.game === 'demo' && stub.kind === 'node');
  const cards = index.stubs.filter(stub => stub.game === 'demo' && stub.kind === 'card');
  assert.deepEqual(nodes.map(stub => stub.id), ['player', 'airborne', 'camera']);
  assert.deepEqual(cards, [{
    id: 'triple-jump', game: 'demo', kind: 'card', name: 'Triple jump',
    summary: 'Three timed jumps launch higher', tags: ['jump'], capabilities: [],
  }]);
});
