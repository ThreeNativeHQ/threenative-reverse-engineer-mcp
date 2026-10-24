import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCatalog, validateGame } from './validate.mjs';
import { readFileSync } from 'node:fs';
const game = JSON.parse(readFileSync(new URL('./test-fixture.json', import.meta.url)));
const catalog = JSON.parse(readFileSync(new URL('./catalog.json', import.meta.url)));
test('strict data schema refuses code fields, fences, broken links and source traversal', () => {
  assert.doesNotThrow(() => validateGame(game));
  for (const mutated of [
    {...game, code: 'bad'},
    {...game, cards: [{...game.cards[0], code: 'bad'}]},
    {...game, title: '```code```'},
    {...game, nodes: [...game.nodes, game.nodes[0]]},
    {...game, cards: [{...game.cards[0], node: 'missing'}]},
    {...game, nodes: game.nodes.map((node, index) => index === 0 ? {...node, paths: ['../secret']} : node)},
  ]) assert.throws(() => validateGame(mutated));
});

test('the seed records effective water-jump velocity after action entry', () => {
  const seed = JSON.parse(readFileSync(new URL('./game-sm64.json', import.meta.url)));
  const launch = seed.cards.find(card => card.id === 'flutter-kick').constants.find(value => value.name === 'waterJumpSpeed');
  assert.equal(launch.value, 42);
  assert.equal(launch.source, 'src/game/mario.c:808');
});

test('catalog rows follow the strict engine index contract', () => {
  assert.doesNotThrow(() => validateCatalog(catalog, [{id: 'sm64'}]));
  const row = catalog[0];
  for (const mutated of [
    [{...row, extra: 'bad'}, catalog[1]],
    [{id: row.id, title: row.title, platform: row.platform, repo: row.repo}, catalog[1]],
    [{...row, tier: 3}, catalog[1]],
    [{...row, id: 'Not_Kebab'}, catalog[1]],
    [{...row, title: '```fenced```'}, catalog[1]],
    [{...row, platform: '~~~'}, catalog[1]],
    [{...row, repo: ''}, catalog[1]],
    [{...row, title: '   '}, catalog[1]],
    [row, row],
  ]) assert.throws(() => validateCatalog(mutated, [{id: 'sm64'}]));
});

test('catalog and game files keep a coherent tier relationship', () => {
  assert.throws(() => validateCatalog(catalog, [{id: 'sm64'}, {id: 'ghost'}]));
  assert.throws(() => validateCatalog([catalog[1]], [{id: 'oot'}]));
  assert.throws(() => validateCatalog([catalog[0]], []));
  assert.doesNotThrow(() => validateCatalog([catalog[0], catalog[1]], [{id: 'sm64'}]));
  assert.throws(() => validateCatalog(catalog, [{id: 'sm64'}], [{game: 'ghost'}]));
});
