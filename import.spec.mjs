import test from 'node:test';
import assert from 'node:assert/strict';
import { importList } from './import.mjs';
import { validateCatalog } from './validate.mjs';

const readme = `# List

**7 projects in total**

## Nintendo 64

5 projects

- **Super Mario 64** — [n64decomp/sm64](https://github.com/n64decomp/sm64)
- **Paperboy** ✦ — [marijnvdwerf/paperboy-n64](https://github.com/marijnvdwerf/paperboy-n64)
- **Mario Kart 64** — [n64decomp/mk64](https://github.com/n64decomp/mk64) · [HarbourMasters/SpaghettiKart](https://github.com/HarbourMasters/SpaghettiKart)
- **1080° Snowboarding** — [bigyoshi51/1080-decomp](https://github.com/bigyoshi51/1080-decomp)
- **1080° Snowboarding** — [djsaunde/1080-decomp](https://github.com/djsaunde/1080-decomp) — *Inactive or archived.*

## Source ports

- **Arx Libertatis** — [arx/ArxLibertatis](https://github.com/arx/ArxLibertatis) — *Source port, PC / DOS. Inactive or archived.*
- **Quake (QuakeSpasm)** — [sezero/quakespasm](https://github.com/sezero/quakespasm) — *Source port, PC / DOS.*
`;
const existing = [{ id: 'sm64', title: 'Super Mario 64', platform: 'Nintendo 64', repo: 'https://github.com/n64decomp/sm64', tier: 1 }];

test('one tier-2 row per list project, platform from the section or the port note', () => {
  const rows = importList(readme, existing);
  assert.equal(rows.length, 7);
  assert.equal(rows.find(row => row.id === 'paperboy').repo, 'https://github.com/marijnvdwerf/paperboy-n64');
  assert.equal(rows.find(row => row.id === 'mario-kart-64').repo, 'https://github.com/n64decomp/mk64');
  assert.deepEqual(rows.find(row => row.repo.endsWith('arx/ArxLibertatis')), {
    id: 'arx-libertatis', title: 'Arx Libertatis', platform: 'PC / DOS', repo: 'https://github.com/arx/ArxLibertatis', tier: 2,
  });
  assert.deepEqual(rows.filter(row => row.title === '1080° Snowboarding').map(row => row.id), ['1080-snowboarding', '1080-snowboarding-djsaunde']);
  assert.doesNotThrow(() => validateCatalog(rows, [{ id: 'sm64' }]));
});

test('a second import keeps every existing id and tier', () => {
  const first = importList(readme, existing);
  const renamed = first.map(row => row.id === '1080-snowboarding' ? { ...row, id: 'snowboarding-1080' } : row);
  const second = importList(readme, renamed);
  assert.deepEqual(second.map(row => row.id).sort(), renamed.map(row => row.id).sort());
  assert.equal(second.find(row => row.id === 'sm64').tier, 1);
});

test('existing rows the list does not hold are kept', () => {
  const quake = { id: 'quake', title: 'Quake', platform: 'PC', repo: 'https://github.com/id-Software/Quake', tier: 1 };
  assert.ok(importList(readme, [...existing, quake]).some(row => row.id === 'quake'));
});

test('a list with no project rows fails closed', () => {
  assert.throws(() => importList('# empty\n', existing), /no projects/);
});
