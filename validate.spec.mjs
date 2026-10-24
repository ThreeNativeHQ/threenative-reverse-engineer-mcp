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
