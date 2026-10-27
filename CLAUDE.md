# Repository rules

- **3D only.** The ThreeNative engine is 3D only, so mapping is 3D only: never add a catalog
  row or a `data/games/<id>.json` file for a 2D game, and reject 2D candidates in review. The
  catalog holds only reviewed, mapped 3D games on 3D-capable platforms.
- Read `README.md` for the data contract and tier rules, and `scripts/scout/BRIEF.md` before
  writing a game file.
- Authored data is canonical JSON: `JSON.stringify(value, null, 2)` plus one trailing
  newline. Every map and constant is pinned to a full commit SHA with `path:line` sources.
- Never copy source code, comments, level layouts, character names or art. Write original
  prose and borrow algorithms and defaults only.
- Verify with `npm run check:data` and `npm run validate` before claiming done.
