import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const scout = (...args) => spawnSync('sh', ['scout/run.sh', ...args], { cwd: root, encoding: 'utf8' });

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

test('validate --game names a missing game file', () => {
  const result = spawnSync('node', ['validate.mjs', '--game', 'nope'], { cwd: root, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /nope/);
});
