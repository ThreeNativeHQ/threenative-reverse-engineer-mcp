# Scout brief

You are one headless scout. Read one game repository at a pinned commit and write one data file.

## Output

Write exactly one file, data/games/<id>.json. It must match schemas/game.schema.json exactly:
- Top level: version 1, id, title, repo, sha, nodes, cards. No unknown fields.
- The file name holds the same id as the document.
- sha is the full 40-hexadecimal commit SHA.
- All strings are original prose. Use no fenced code, no code excerpts and no comments.
- Canonical formatting: JSON.stringify(value, null, 2) plus one trailing newline.

## Guardrail

Borrow algorithms and defaults only. Copy no source code, comments, level layouts, character names or art. Write original prose.

## Units

Every constant states its unit AND its timestep, for example "units/frame at 30 Hz" or "seconds". When the source update rate is unknown, write "per update, rate unverified".

## Sources

Every constant.source and every card source is "path:line" at the pinned SHA. The cited line must contain the numeric literal. Map node paths and functions use [start, end] line ranges that exist at the SHA, and a function name must appear on its start line.

## Map nodes

Each node has id, name, purpose, paths, functions and dependsOn. Nodes cover the repository areas that the cards cite.

## Cards

Write at least 10 cards for mechanics that users ask for: movement, jump, camera, combat, physics feel. Each card is linked to a node through card.node and has at least one source.

## Catalog ownership

data/catalog.json is not yours to write. The review lane promotes your game with a Tier-1 catalog row. Validation runs over the whole library, so a missing Tier-1 row is reported to that lane, not fixed here.

## Finish

From the repository root run `node scripts/validate.mjs --source .sources/<id> --game <id>`. Fix every error it prints in your file and repeat until it passes.
