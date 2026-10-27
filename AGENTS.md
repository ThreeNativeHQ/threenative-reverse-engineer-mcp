# Agent instructions

- **3D only.** The engine is 3D only, so mapping is 3D only. Never create a catalog row or a
  `data/games/<id>.json` map for a 2D game, and reject 2D candidates in review. The catalog
  holds only reviewed, mapped 3D games on 3D-capable platforms.
- Contract: `README.md`. Per-game mapping brief: `scripts/scout/BRIEF.md`.
- One mapped game is one `data/games/<id>.json` file plus one catalog row carrying
  platform, rating and genre. Canonical JSON: `JSON.stringify(value, null, 2)` plus one
  trailing newline.
- Every constant and card source is `path:line` at the pinned full SHA. Validate a game with
  `node scripts/validate.mjs --source .sources/<id> --game <id>`, the library with
  `npm run check:data`.
- Original prose only. Do not copy source code, comments, level layouts, character names or
  art; borrow algorithms and defaults instead.
