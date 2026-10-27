import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCatalog, validateGame } from '../scripts/validate.mjs';
import { readFileSync } from 'node:fs';
const game = JSON.parse(readFileSync(new URL('./fixtures/game.json', import.meta.url)));
const catalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url)));
const sm64Row = catalog.find(row => row.id === 'sm64');
const tier2Row = {id: 'demo-tier2', title: 'Demo', platform: 'PC', repo: 'https://github.com/example/demo', tier: 2};
const tier1 = catalog.filter(row => row.tier === 1).map(row => ({id: row.id}));
const without = (value, name) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== name));

test('the disk-loaded game schema accepts tracked data', () => {
  assert.doesNotThrow(() => validateGame(JSON.parse(readFileSync(new URL('../data/games/sm64.json', import.meta.url)))));
  assert.doesNotThrow(() => validateGame(game));
});

test('the disk-loaded game schema refuses unknown fields, missing fields and wrong types', () => {
  for (const mutated of [
    {...game, code: 'bad'},
    {...game, cards: [{...game.cards[0], code: 'bad'}]},
    without(game, 'sha'),
    {...game, sha: 'a'.repeat(41)},
    {...game, version: '1'},
    {...game, nodes: game.nodes.map((node, index) => index === 0 ? {...node, functions: 'none'} : node)},
    {...game, cards: [{...game.cards[0], constants: [{...game.cards[0].constants[0], value: null}]}]},
    {...game, title: '```code```'},
    {...game, nodes: [...game.nodes, game.nodes[0]]},
    {...game, cards: [{...game.cards[0], node: 'missing'}]},
    {...game, nodes: game.nodes.map((node, index) => index === 0 ? {...node, paths: ['../secret']} : node)},
  ]) assert.throws(() => validateGame(mutated));
});

test('the disk-loaded catalog schema refuses unknown fields, missing fields and wrong types', () => {
  for (const mutated of [
    [{...sm64Row, extra: 'bad'}, tier2Row],
    [without(sm64Row, 'repo'), tier2Row],
    [{...sm64Row, tier: '1'}, tier2Row],
    [{...sm64Row, tier: 3}, tier2Row],
    [{...sm64Row, rating: 0}, tier2Row],
    [{...sm64Row, rating: 6}, tier2Row],
    [{...sm64Row, rating: '5'}, tier2Row],
    [{...sm64Row, rating: 3.5}, tier2Row],
    [{...sm64Row, id: 'Not_Kebab'}, tier2Row],
    [{...sm64Row, title: '```fenced```'}, tier2Row],
    [{...sm64Row, platform: '~~~'}, tier2Row],
    [{...sm64Row, repo: ''}, tier2Row],
    [{...sm64Row, title: '   '}, tier2Row],
    [sm64Row, sm64Row],
  ]) assert.throws(() => validateCatalog(mutated, [{id: 'sm64'}]));
});

test('the tracked catalog passes the schema and the tier relationships', () => {
  assert.doesNotThrow(() => validateCatalog(catalog, tier1));
  assert.throws(() => validateCatalog(catalog, [...tier1, {id: 'ghost'}]));
  assert.doesNotThrow(() => validateCatalog([sm64Row, tier2Row], [{id: 'sm64'}]));
  assert.throws(() => validateCatalog([tier2Row], [{id: 'demo-tier2'}]));
  assert.throws(() => validateCatalog([without(sm64Row, 'rating'), tier2Row], [{id: 'sm64'}]), /rating/);
  assert.throws(() => validateCatalog([sm64Row], []));
  assert.throws(() => validateCatalog(catalog, tier1, [{game: 'ghost'}]));
});

test('the seed records effective water-jump velocity after action entry', () => {
  const seed = JSON.parse(readFileSync(new URL('../data/games/sm64.json', import.meta.url)));
  const launch = seed.cards.find(card => card.id === 'flutter-kick').constants.find(value => value.name === 'waterJumpSpeed');
  assert.equal(launch.value, 42);
  assert.equal(launch.source, 'src/game/mario.c:808');
});
