import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogRow, cleanup, demoGame, makeLibrary, makeSourceRepo, write, writeExecutable } from './support.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const scout = (...args) => spawnSync('sh', ['scripts/scout/run.sh', ...args], { cwd: root, encoding: 'utf8' });

test('scout without arguments exits 2 with usage on stderr', () => {
  const result = scout();
  assert.equal(result.status, 2);
  assert.match(result.stderr, /usage/);
});

test('scout rejects a short sha before any network access', () => {
  const result = scout('demo', 'https://github.com/example/demo', 'abc');
  assert.equal(result.status, 2);
});

test('scout rejects an id with invalid characters', () => {
  const result = scout('Bad_ID', 'https://github.com/example/demo', '0'.repeat(40));
  assert.equal(result.status, 2);
});

test('scout writes the canonical game path and runs the real validator on it', t => {
  const source = makeSourceRepo();
  const dir = makeLibrary({ catalog: [catalogRow()] });
  t.after(() => cleanup(dir));
  const gameFile = write(dir, 'prepared.json', JSON.stringify(demoGame(source.sha), null, 2) + '\n');
  const arm = writeExecutable(dir, 'arm.sh', `#!/bin/sh\nset -eu\ncp "${gameFile}" "$1/data/games/demo.json"\n`);
  const result = spawnSync('sh', ['scripts/scout/run.sh', 'demo', source.dir, source.sha], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, SCOUT_ARM: arm },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`demo@${source.sha}: 3 nodes, 1 cards, all pinned source checks passed`));
  const written = JSON.parse(readFileSync(path.join(dir, 'data', 'games', 'demo.json'), 'utf8'));
  assert.equal(written.cards[0].constants[0].value, 69);
  const brief = readFileSync(path.join(dir, '.sources', 'demo.brief.md'), 'utf8');
  assert.match(brief, /Write: data\/games\/demo\.json/);
  assert.match(brief, /schemas\/game\.schema\.json/);
});
