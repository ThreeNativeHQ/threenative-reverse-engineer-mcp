import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGame } from './validate.mjs';
import { readFileSync } from 'node:fs';
const game = JSON.parse(readFileSync(new URL('./test-fixture.json', import.meta.url)));
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
