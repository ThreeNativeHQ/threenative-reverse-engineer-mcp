# ThreeNative game references

Mechanic cards and repository maps for authoring original games. Data is CC-BY 4.0;
attribute this repository and preserve each game's pinned source links. The linked
source repositories retain their own licences. Read them, borrow algorithms and defaults,
and copy no source code, comments, levels, character names or art into cards or games.

`catalog.json` lists Tier-1 mapped games and Tier-2 repositories to explore on demand.
`game-<id>.json` holds a map and mechanic cards at one full Git commit SHA. The strict
`schema.json` rejects unknown fields and fenced code in every string. `validate.mjs`
checks links, paths, function ranges and numeric literals against that exact source revision.
Those checks cannot establish effective values after later assignments or action transitions;
every card needs semantic source review before a release. Raw units and action-update frames
need explicit conversion when adapting the mechanic to another game; no common real-time frame
rate is assumed across source regions.

```sh
npm ci
node --test validate.spec.mjs
npm run validate
npm run release:assets
```

Validation fetches only the pinned source commits into ignored `.sources/`.
Use `node validate.mjs --source /path/to/pinned/clone` to reuse a local clone.
Release assets in `.release/` are `index.json.gz` (catalog plus searchable stubs)
and one lazy `game-<id>.json` per mapped game. Tag `v0.1` after review; the single
workflow validates every source citation before publishing.

ThreeNative's existing engine MCP serves `engine_search_references`,
`engine_reference_detail` and `engine_save_reference`; no new server is needed.
Saved project references return a contribution issue command for review here.
Contributions need original prose, meaningful constants with `path:line` sources,
valid map links, and a full commit SHA. Code, art and level layouts belong outside this data.
