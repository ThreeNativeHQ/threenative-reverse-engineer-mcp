# Agent instructions

- **3D only.** The engine is 3D only, so mapping is 3D only. Never create a Tier-1 catalog
  row or a `data/games/<id>.json` map for a 2D game, and reject 2D candidates in review.
  Imported Tier-2 rows may name 2D games; leave them unrated and unmapped. The pre-existing
  2D entries `super-metroid-sm` and `openra` are legacy, not a precedent.
- Contract: `README.md`. Per-game mapping brief: `scripts/scout/BRIEF.md`.
- One mapped game is one `data/games/<id>.json` file plus one Tier-1 catalog row carrying
  platform, rating and genre. Canonical JSON: `JSON.stringify(value, null, 2)` plus one
  trailing newline.
- Every constant and card source is `path:line` at the pinned full SHA. Validate a game with
  `node scripts/validate.mjs --source .sources/<id> --game <id>`, the library with
  `npm run check:data`.
- Original prose only. Do not copy source code, comments, level layouts, character names or
  art; borrow algorithms and defaults instead.
