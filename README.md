# ThreeNative game references

Mechanic cards and repository maps for authoring original games. Data is CC-BY 4.0;
attribute this repository and preserve each game's pinned source links. The linked
source repositories retain their own licences. Read them, borrow algorithms and defaults,
and copy no source code, comments, levels, character names or art into cards or games.

`data/catalog.json` lists the mapped 3D games; every row has a matching
`data/games/<id>.json` map at one full Git commit SHA. The strict
`schemas/game.schema.json` and `schemas/catalog.schema.json` reject unknown fields, wrong
types, missing fields and fenced code in every string. `scripts/validate.mjs`
checks links, paths, function ranges and numeric literals against that exact source revision.
Those checks cannot establish effective values after later assignments or action transitions;
every card needs semantic source review before a release. Raw units and action-update frames
need explicit conversion when adapting the mechanic to another game; no common real-time frame
rate is assumed across source regions.

```sh
npm ci
npm test
npm run check:data   # offline: layout, schemas, links, catalog tiers, formatting
npm run validate
npm run release:assets
```

Authored data is canonical JSON: `JSON.stringify(value, null, 2)` plus one trailing newline,
with object insertion order and array order preserved.
Validation fetches only the pinned source commits into ignored `.sources/`.
Use `npm run validate -- --game <id> --source /path/to/pinned/clone` to reuse a local clone
for one game; catalog consistency is still checked for the whole library. While a parallel
batch is being authored, add `--isolated` to check one game's schema and pinned sources
without requiring every sibling Tier-1 file to exist; the full library check stays mandatory
before release.

## Scope: 3D only

The ThreeNative engine is 3D only, so this library holds 3D games only. Do not add a catalog
row or a `data/games/<id>.json` map for a 2D game, and reject a 2D candidate in review however
canonical it is. `npm run check:data` rejects a catalog row whose platform is not 3D-capable.

## Ratings

Every mapped catalog row carries a `rating` from 1 to 5 for how canonical the game is:
5 genre-defining, 4 landmark, 3 notable, 2 niche, 1 minor. It is one editorial value per game,
owned by the reviewing lane and kept on the catalog row only, so a game file and its row cannot
disagree. `npm run check:data` fails when a mapped game has no rating.

## Genres

Mapped catalog rows also carry a `genre` from a closed vocabulary (platformer, action-adventure,
rpg, shooter, racing, fighting, strategy, simulation, puzzle, sports, rhythm, horror, stealth,
party) plus an optional lowercase `subgenre` label such as `rts`, `fps` or `metroidvania`.
`genre` is the stable filter key; `subgenre` is editorial nuance and may be omitted. Both live on
the catalog row only and are required for mapped games, so `npm run check:data` fails when a mapped
game is unclassified.

## Platforms and project kinds

`platform` is a closed vocabulary of 52 platform names (for example `Nintendo 64`, `PC / DOS`,
`PlayStation`), or `unknown` when the source does not name one. The catalog accepts only
3D-capable platforms.

`kind` records what the repository is: `decompilation`, `disassembly`,
`static-recompilation`, `port`, `source-port`, `browser-port`, `engine-reimplementation`,
`system-software` or `original-source`. Mapped games must name a real platform.

Release assets in `.release/` are `index.json.gz` (catalog plus searchable stubs)
and one lazy `game-<id>.json` per mapped game. Tag `v0.1` after review; the single
workflow validates every source citation before publishing.

ThreeNative's existing engine MCP serves `engine_search_references`,
`engine_reference_detail` and `engine_save_reference`; no new server is needed.
Saved project references return a contribution issue command for review here.
Contributions need original prose, meaningful constants with `path:line` sources,
valid map links, and a full commit SHA. Code, art and level layouts belong outside this data.

## Candidate intake

New games are proposed from decompilation projects, source ports or original source releases and
enter the catalog only after a scout has mapped the pinned repository and the review lane has
accepted the file. Unreviewed repository lists are never committed, so the catalog stays 3D-only.

## Scouts

A scout is one headless agent run that maps one pinned repository into `data/games/<id>.json`.
Run `npm run scout -- <id> <repo> <sha>`; it clones into `.sources/`, logs to `.sources/<id>.scout.log`
and then runs the validator on that game. Promoting a new map with a catalog row belongs
to the review lane, not to the scout.
Every card gets a full human or agent review before merge.
