import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCatalog, validateGame } from './validate.mjs';
import { readFileSync } from 'node:fs';
const game = JSON.parse(readFileSync(new URL('./test-fixture.json', import.meta.url)));
const catalog = JSON.parse(readFileSync(new URL('./catalog.json', import.meta.url)));
const sm64Row = catalog.find(row => row.id === 'sm64');
const tier2Row = {id: 'demo-tier2', title: 'Demo', platform: 'PC', repo: 'https://github.com/example/demo', tier: 2};
const tier1 = catalog.filter(row => row.tier === 1).map(row => ({id: row.id}));
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
  assert.doesNotThrow(() => validateCatalog(catalog, tier1));
  const row = sm64Row;
  for (const mutated of [
    [{...row, extra: 'bad'}, tier2Row],
    [{id: row.id, title: row.title, platform: row.platform, repo: row.repo}, tier2Row],
    [{...row, tier: 3}, tier2Row],
    [{...row, id: 'Not_Kebab'}, tier2Row],
    [{...row, title: '```fenced```'}, tier2Row],
    [{...row, platform: '~~~'}, tier2Row],
    [{...row, repo: ''}, tier2Row],
    [{...row, title: '   '}, tier2Row],
    [row, row],
  ]) assert.throws(() => validateCatalog(mutated, [{id: 'sm64'}]));
});

test('catalog and game files keep a coherent tier relationship', () => {
  assert.throws(() => validateCatalog(catalog, [...tier1, {id: 'ghost'}]));
  assert.throws(() => validateCatalog([tier2Row], [{id: 'demo-tier2'}]));
  assert.throws(() => validateCatalog([sm64Row], []));
  assert.doesNotThrow(() => validateCatalog([sm64Row, tier2Row], [{id: 'sm64'}]));
  assert.throws(() => validateCatalog(catalog, tier1, [{game: 'ghost'}]));
});
