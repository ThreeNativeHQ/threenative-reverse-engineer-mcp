# ThreeNative game references

Mechanic cards and repository maps for authoring original games. Data is CC-BY 4.0;
attribute this repository and preserve each game's pinned source links. The linked
source repositories retain their own licences. Read them, borrow algorithms and defaults,
and copy no source code, comments, levels, character names or art into cards or games.

`data/catalog.json` lists Tier-1 mapped games and Tier-2 repositories to explore on demand.
`data/games/<id>.json` holds a map and mechanic cards at one full Git commit SHA. The strict
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
for one game; catalog consistency is still checked for the whole library.
## Ratings

Every mapped (Tier-1) catalog row carries a `rating` from 1 to 5 for how canonical the game is:
5 genre-defining, 4 landmark, 3 notable, 2 niche, 1 minor. It is one editorial value per game,
owned by the reviewing lane and kept on the catalog row only, so a game file and its row cannot
disagree. Tier-2 rows stay unrated until someone maps the game; `npm run check:data` fails when a
mapped game has no rating.

Release assets in `.release/` are `index.json.gz` (catalog plus searchable stubs)
and one lazy `game-<id>.json` per mapped game. Tag `v0.1` after review; the single
workflow validates every source citation before publishing.

ThreeNative's existing engine MCP serves `engine_search_references`,
`engine_reference_detail` and `engine_save_reference`; no new server is needed.
Saved project references return a contribution issue command for review here.
Contributions need original prose, meaningful constants with `path:line` sources,
valid map links, and a full commit SHA. Code, art and level layouts belong outside this data.

## Tier 2 import

Tier 2 holds one catalog row per project in the
[Greatest Games Decompilations List](https://github.com/Carter54git/Greates-Games-Decompilations-List).
Download its README at a pinned commit and run `npm run import -- <README.md>`.
Existing rows keep their id and tier; a repository listed twice gets one row.

## Scouts

A scout is one headless agent run that maps one pinned repository into `data/games/<id>.json`.
Run `npm run scout -- <id> <repo> <sha>`; it clones into `.sources/`, logs to `.sources/<id>.scout.log`
and then runs the validator on that game. Promoting a new map with a Tier-1 catalog row belongs
to the import/review lane, not to the scout.
Every card gets a full human or agent review before merge.
