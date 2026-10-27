# PRD-001 — Organize and validate the reference library

**Status:** DONE
**Priority:** P2 — Canonical data locations and consistent validation across authoring and release are unfinished.
**Complexity:** 3 (LOW)
**Owner:** Implementing agent
**Depends on:** None
**Progress:** 8/8 acceptance criteria verified.

## Context

This repository is a Git-managed reference library consumed by ThreeNative's existing engine MCP. It is not a new MCP server or a public toolchain. João selected that scope and JSON + JSON Schema as the storage contract.

Authored game data, the catalog, a schema, a test fixture, executable scripts, and tests currently share the root directory. This layout is enforced by the implementation: `validate.mjs:117` discovers root-level `game-*.json`; `import.mjs:41` reads the root catalog; `scout/run.sh:27` and `scout/BRIEF.md:7` instruct agents to write at the root.

The existing Ajv validator already checks game structure, unknown fields, source paths, node/card IDs, parent/dependency links, and constant citations. Catalog schema rules are embedded in `validate.mjs`; catalog/game tier relationships are checked only in the release branch at `validate.mjs:134`. The release workflow runs validation/import tests but omits `scout/run.spec.mjs`.

The inspected working tree has 3,287 catalog rows (640,166 bytes), five tracked game maps, and one untracked Super Smash Bros. map. The untracked map belongs to another lane: preserve it and keep it outside this task's migration until its owner lands or explicitly hands it over. Counts are a planning snapshot, not a fixed acceptance threshold.

Complexity: 3 → LOW; risk override: none. File moves and source/config changes touch 11+ files; no new service, database, external API, or independent release boundary is introduced. Estimated implementation: 90–150 minutes, plus 5–20 minutes for pinned-source fetching depending on network/cache availability.

## Solution

### Canonical layout

```text
data/
  catalog.json
  games/
    <id>.json
schemas/
  game.schema.json
  catalog.schema.json
scripts/
  import.mjs
  validate.mjs
  scout/
    run.sh
    BRIEF.md
tests/
  validate.spec.mjs
  import.spec.mjs
  scout.spec.mjs
  library.spec.mjs
  fixtures/
    game.json
docs/
  PRDs/
```

Keep `README.md`, `LICENSE`, package manifests, `.gitignore`, and `.github/` in their conventional locations. Keep ignored `.sources/` and `.release/` locations and published asset names unchanged. Use `git mv` for tracked files; retain all parsed data values and array order. No game splitting or schema version bump is required.

Use the current ES modules, Node built-ins, Ajv dependency, and `node:test`. Derive JavaScript data/schema paths from module locations. Resolve the repository root from the scout script's location before running its existing commands. Do not add a framework, generic repository layer, TypeScript migration, or new dependency.

### Data contracts and consistency

- Move the existing game schema without weakening it. Preserve its `$id` as a logical identifier; load schemas locally rather than fetching that URL. Extract the inline catalog schema into `schemas/catalog.schema.json` without narrowing the catalog's existing repository URL contract.
- Runtime type checks use Ajv against both schemas: required fields, field types, enums, patterns, and unknown-field rejection. TypeScript compile-time types would not establish the validity of JSON read from disk.
- Reuse `validateGame` and `validateCatalog` for semantic consistency. Retain duplicate-ID, map/card linkage, source-path, parent-cycle, and Tier-1 completeness checks. Require each `data/games/<id>.json` filename to match its document's `id`. IDs remain unique within their existing scopes; do not impose global uniqueness across games on node/card IDs.
- Define canonical authored JSON as `JSON.stringify(value, null, 2) + '\n'`. Check formatting without rewriting files. Preserve object insertion order and array order; do not sort cards, nodes, or catalog rows. Test fixtures and schemas are outside this authored-data formatting gate.
- All validation modes first check the complete authored dataset locally. `--game <id>` limits expensive pinned-source verification to that game; it does not weaken catalog consistency. A missing selected ID remains an error. Reject root-level legacy `game-*.json` or `catalog.json` so misplaced scout output cannot be silently ignored.

### Commands and write boundaries

| Command | Intended behavior |
|---|---|
| `npm run check:data` | New script: `node scripts/validate.mjs --data-only`; parse, schema-check, validate relationships/filenames, and check formatting for all authored data without Git fetches or writes. |
| `npm run validate` | Keep the existing command name; run complete local checks and existing pinned-source verification. Preserve `--game` and `--source` arguments through `npm run validate -- ...`. |
| `npm run import -- <README.md>` | Keep the command name; import into the canonical catalog, validate candidate rows against current game maps, and write canonical JSON only after validation succeeds. Preserve existing IDs and tiers. |
| `npm run scout -- <id> <repo> <sha>` | Keep the command name and `SCOUT_ARM` wrapper contract; write only `data/games/<id>.json`, then run the real validator with the existing pinned checkout. Both brief and shell prompt name the same output path. |
| `npm run release:assets` | Keep the command name; validate before generating `.release/index.json.gz` and `.release/game-<id>.json` with the existing version-1 payloads. |
| `npm test` | New script: `node --test tests/*.spec.mjs`; collect moved suites and focused CLI integration coverage. |

The importer validates the complete candidate catalog before changing its destination. Use a temporary file in the destination directory followed by rename, cleaning it on failure; malformed input and validation failures leave the existing catalog unchanged. Validation commands remain read-only for authored data. Scout catalog promotion remains outside the scout's write ownership: a new map must have a matching Tier-1 row supplied by its owning import/review lane before whole-library checks can pass.

Keep existing exported helper names used by the moved tests. Root-level script paths are internal migration points, not compatibility entry points: update their repository callers together and remove the old files instead of retaining forwarding copies. Stable public entry points are the npm commands and release assets.

### Approaches considered

1. **Selected:** organize the Git-managed library, retain JSON + schemas, and reuse the current scripts/validators. This matches João's selected scope and preserves reviewable data diffs.
2. A reusable toolchain with a public module API adds packaging and compatibility obligations that are outside the selected scope.
3. YAML or a database as the authored source introduces conversion/migration work without a demonstrated storage requirement. A generated database index can be considered separately if measured search needs justify it.

### Non-goals

No new MCP server, database, YAML, TypeScript conversion, per-card files, search redesign, new game content, semantic rewriting of mechanics, or changes to published filenames, compression, version fields, or consumer payloads. No merge, deployment, or release publication is authorized by this planning request.

## Acceptance Criteria

Boxes record implementation evidence from the implementation revision. Local actor: implementing agent.
Shared actor: repository CI, triggered by the implementation revision.

- [x] AC-1 [local]: The tracked library uses the canonical layout, with identical parsed game/catalog values and no legacy authored data/scripts/fixtures in the root. — proof: `node --test tests/library.spec.mjs` (assert canonical locations and absence of legacy paths), plus a one-time Node comparison of migrated documents against their pre-move Git blobs (record baseline SHA and result here; do not freeze future content in a permanent historical-equality test). — Evidence: 2026-10-26. The layout test reads `git ls-files` and requires the canonical paths while rejecting root `catalog.json`/`schema.json`/`test-fixture.json`/`validate.mjs`/`import.mjs`/`game-*.json`/root suites and `scout/`. One-time comparison at baseline `8b36c2c44b57f1e6472ef6701a03cb1ed0f2b56b`: all six migrated documents (catalog + 5 games) parsed equal to their pre-move blobs and differed only in whitespace and `\u00b2` escape bytes, which the one-time canonicalization of `data/games/quake.json` and `data/games/sm64.json` removed. The same suite also fails if tracked code, scripts or the README retain a legacy routing reference (`node validate.mjs`, `node import.mjs`, root `scout/run.sh`, `test-fixture.json`) or if a `package.json` script target no longer exists.
- [x] AC-2 [local]: Both schemas are actually loaded by validation and reject incorrect types, missing required fields, and unknown fields while preserving accepted existing data. — proof: `node --test tests/validate.spec.mjs` (extend existing mutation cases to exercise both disk-loaded schemas). — Evidence: `scripts/validate.mjs:13-16` compiles `schemas/game.schema.json` and `schemas/catalog.schema.json` from disk. The suite rejects unknown top-level and nested fields, missing required fields, wrong types (`version`, `functions`, constant `value`, catalog `tier`), pattern/const/enum violations for both documents, and accepts `data/games/sm64.json`, the tracked catalog and `tests/fixtures/game.json`. A further case mutates each schema file in a disposable copy and observes the validator reject data it had accepted, which proves both schemas are read from disk rather than hardcoded.
- [x] AC-3 [local]: `npm run check:data` accepts the real tracked dataset offline and fails on wrong filenames, duplicate IDs, broken links/tier relationships, noncanonical formatting, or legacy root data. — proof: `npm run check:data` and the data-check CLI cases in `node --test tests/library.spec.mjs` (isolated copied datasets; assert nonzero exit and useful errors for each distinct fault). — Evidence: Clean export of the tracked tree (`git checkout-index`) printed `data: 3287 catalog rows and 5 games are canonical and consistent` with exit 0 and no Git fetch. Thirteen isolated faults each exit nonzero with their intended message: legacy root `catalog.json`/`game-*.json`, duplicate catalog ids, filename/id disagreement, tier-1 row without a game file, game absent from the catalog, game with only a tier-2 row, broken card link, unsafe source path, unknown field, wrong type, noncanonical catalog and game formatting, and an empty library. The check is also verified read-only and offline: authored `data/` digests are unchanged and no `.sources/` or `.release/` directory appears. The other lane's map was handed over after that check: it now lives at `data/games/super-smash-bros-vetritheretri.json` with a promoted Tier-1 row, and the working tree reports `6 games` with no legacy root data.
- [x] AC-4 [local]: The import CLI updates only `data/catalog.json` with valid canonical rows, preserves existing IDs/tiers, and leaves prior bytes unchanged on invalid input. — proof: `node --test tests/import.spec.mjs` (existing parser regressions plus real CLI execution in a disposable library fixture). — Evidence: `npm run import` in a fixture writes only `data/catalog.json`, canonical, preserving the existing Tier-1 row first and appending list rows in README order (1→8 rows), with no temporary file left in `data/`. An empty list and an all-whitespace title exit nonzero and leave the catalog bytes unchanged (`scripts/import.mjs:44-52` validates the candidate set before the atomic rename).
- [x] AC-5 [local]: The scout command and brief produce the canonical game path and successfully invoke the real validator on that output. — proof: `node --test tests/scout.spec.mjs` (preserve argument rejection tests; use `SCOUT_ARM` with a local pinned Git fixture, assert the written data path and successful source verification). — Evidence: The `SCOUT_ARM` fixture run exits 0 with `demo@<sha>: 3 nodes, 1 cards, all pinned source checks passed` and writes `data/games/demo.json`; `.sources/demo.brief.md` instructs `Write: data/games/demo.json`, matching `scripts/scout/BRIEF.md:7`; the runner resolves the repository root from its own location (`scripts/scout/run.sh:4`) and calls `scripts/validate.mjs` (`scripts/scout/run.sh:44`). The three argument-rejection tests still exit 2. A further test derives the output path from the runner prompt and requires the brief to name the same path, so prompt and brief cannot drift apart.
- [x] AC-6 [local]: Existing targeted pinned-source validation still succeeds through the updated npm entry point, and bad source citations still fail. — proof: targeted CLI cases in `node --test tests/library.spec.mjs` using the fixture's exact Git SHA and `npm run validate -- --game <id> --source <fixture-repo>`; retain the existing real SM64 constant regression. — Evidence: All five tracked games pass through `npm run validate -- --game <id> --source .sources/<id>` against local pinned checkouts: sm64 49 nodes/11 cards, quake 9/22, oot 8/17, openra 8/15, super-metroid-sm 8/15. A wrong fixture constant fails with `constant launchSpeed=70 absent`; a broken sibling game still fails under `--game demo`; `tests/validate.spec.mjs` keeps the `flutter-kick`/`waterJumpSpeed` regression on real data.
- [x] AC-7 [local]: Release generation preserves the version-1 catalog/stub contract, gzip index name, and per-game asset names/content. — proof: release CLI cases in `node --test tests/library.spec.mjs` (build into a fresh disposable `.release/` from a pinned fixture; decompress/parse index and assert references, schema-valid game content, and exact asset set). — Evidence: The fixture build produces exactly `index.json.gz` and `game-<id>.json`; the decompressed index reports `version: 1`, `games` deep-equal to the catalog, and node/card stubs with the expected shape, and each game asset is byte-equal to `JSON.stringify(game)` and schema-valid. Building from the five pre-migration tracked games produced assets byte-identical to the pre-migration `.release/` (equal sha256 for `index.json.gz` and every `game-<id>.json`; 3287 games, 162 stubs).
- [x] AC-8 [shared]: The implementation PR's `validate` job collects all moved suites and successfully builds release assets from all tracked real games. — proof: `.github/workflows/release.yml` job `validate`: `npm ci`, `npm test`, `npm run check:data`, `npm run release:assets`; record the actual run URL and candidate revision. — Evidence: [run 40444998246](https://github.com/ThreeNativeHQ/threenative-reverse-engineer-mcp/actions/runs/40444998246), PR #1 / `pull_request` on candidate revision `097cdd4eb0a13b858e44fafed2818bb46810484c`: job `validate` succeeded through `npm ci`, `npm test`, `npm run check:data` and `npm run release:assets`, then uploaded the reference assets. The same revision passed the same steps locally (AC-7), and the built assets were byte-identical to the pre-migration build.

## Integration Ledger

Locations describe the implemented entry points at this revision; the npm commands are the supported interface.

| Capability | Reachable consumer/trigger | Replaces / disposition | Evidence |
|---|---|---|---|
| Local consistency and pinned verification | `package.json:9` validate script → `scripts/validate.mjs:130` run → `scripts/validate.mjs:72` loadLibrary | Moved to `scripts/validate.mjs`; canonical discovery under `data/games/` plus both disk-loaded schemas replace root scanning and the inline catalog schema. New offline entry point `package.json:7` (`--data-only`, `scripts/validate.mjs:139`). | AC-1–3, AC-6 |
| Catalog import | `package.json:12` import script → `scripts/import.mjs:38` CLI | Moved; reads `data/catalog.json` through `loadLibrary` (`scripts/import.mjs:44`), validates the candidate set against the game maps (`scripts/import.mjs:46`) and replaces the catalog by atomic rename (`scripts/import.mjs:52`). | AC-4 |
| Scout output | `package.json:11` scout script → `scripts/scout/run.sh:44` final validation | Moved; runner resolves the repository root (`scripts/scout/run.sh:4`), names `data/games/<id>.json` in the prompt (`scripts/scout/run.sh:30`) and brief (`scripts/scout/BRIEF.md:7`), and states catalog ownership (`scripts/scout/BRIEF.md:34`). | AC-5 |
| Release assets | `package.json:10` release script → `scripts/validate.mjs:153` release branch → `.github/workflows/release.yml:22` artifact upload | Asset names, gzip index and version-1 payloads unchanged; workflow collects every suite (`release.yml:20`), the offline check (`release.yml:21`) and the real-source build (`release.yml:22`). | AC-7–8 |

## Decisions

- 2026-10-26 (João): select an organized Git-managed reference library rather than a reusable toolchain.
- 2026-10-26 (João): keep JSON + JSON Schema and create the PRD before implementation.
- 2026-10-26 (agent proposal): reuse Ajv for runtime data checks, extract the catalog schema, and add an offline consistency command; leave TypeScript out of this refactor.
- 2026-10-26 (agent proposal): preserve existing data/release contracts and npm command names, with a single canonical source layout and no legacy-path fallback.
- 2026-10-26 (implementation): the smoke map handed over from the scout lane was promoted to `data/games/super-smash-bros-vetritheretri.json` with a Tier-1 catalog row after its 11 nodes and 19 cards passed pinned-source verification.
- 2026-10-26 (implementation): one-time canonicalization of `game-quake.json` and `game-sm64.json` changed whitespace and `\u00b2` escape bytes only; parsed values and array order were verified equal to the pre-move blobs, so the formatting gate accepts the tracked dataset without weakening it.

## Execution Phases

#### Phase 1: Canonical library paths work through existing consumers

**Status:** COMPLETE

**Files:** tracked `game-*.json` → `data/games/<id>.json`; `catalog.json` → `data/catalog.json`; `schema.json` → `schemas/game.schema.json`; `validate.mjs` and `import.mjs` → `scripts/`; `scout/run.sh` and `scout/BRIEF.md` → `scripts/scout/`; existing suites → `tests/`; `test-fixture.json` → `tests/fixtures/game.json`; update `package.json`, `README.md`, `.github/workflows/release.yml`; add focused `tests/library.spec.mjs`.

**Implementation:** Inventory tracked data at the implementation revision and preserve unrelated untracked work. Use `git mv` and update all readers, writers, test imports, schema loads, prompts, CLI subprocess paths, npm commands, and workflow paths in one working slice. Add the test script and include the previously omitted scout suite. Verify parsed-value preservation once against pre-move tracked blobs and record the baseline revision with AC-1; permanent tests check layout rather than preventing future data edits. Keep the ignored cache/build locations and release asset contract intact. Do not migrate the untracked game owned by another lane.

**Verification:** `npm test` exercises migrated entry points and catches stale root readers; lossless migration and release CLI tests cover AC-1, AC-5–7. Keep their evidence pending until the relevant assertions exist and run; offline consistency criteria finish in Phase 2.

#### Phase 2: Every authoring and validation path enforces consistency

**Status:** COMPLETE

**Files:** `schemas/catalog.schema.json`, `scripts/validate.mjs`, `scripts/import.mjs`, `scripts/scout/BRIEF.md`, `package.json`, affected tests and README.

**Implementation:** Extract and load the catalog schema. Reuse current semantic checks in a complete offline preflight. Add `--data-only` and `check:data`; enforce filename/ID agreement, canonical authored formatting, legacy-root rejection, and catalog completeness before selected source checks or release writes. Validate importer candidates before atomic catalog replacement. Update the scout brief to explain catalog ownership and whole-library validation. Add red-before-green regression cases only for new checks/write behavior; preserve existing passing behavior without manufactured failures.

**Verification:** `npm run check:data` against the actual tracked dataset and `npm test` cover AC-2–6. Each newly added rejection must fail for the intended data fault, not an import/path error. Run fixture CLI tests without network or external agent calls; retain all pinned-source checks in the production path.

#### Phase 3: Verify real release compatibility and finish the refactor

**Status:** COMPLETE

**Files:** `.github/workflows/release.yml`, `README.md`, this PRD; implementation fixes only where observed checks require them.

**Implementation:** Confirm workflow collection of every suite, independent offline checking, and release generation from canonical data. Inspect the diff and final integration locations. Keep results on the owning AC and PR; do not create separate evidence reports. When all ACs including the shared CI gate have current evidence, mark DONE and `git mv` this PRD to `docs/PRDs/done/` in the finishing commit. Any required shared failure keeps it open.

**Verification:** Local `npm test` and `npm run check:data` once after the final relevant change, plus the actual CI `validate` job's pinned-source release build (AC-8). Reuse current local results rather than duplicating CI's real-source fetch solely for ceremony. For any local job expected to exceed five minutes, check the laptop-offload skill and capacity first. Self-review suffices for LOW complexity. No merge or publication without a separate request.

## Risks and execution constraints

- Concurrent scouting can add root-level maps during migration. Reconcile tracked inputs at implementation start and update the owning lane's output convention; preserve its untracked file. The preserved map was later handed over and promoted to `data/games/super-smash-bros-vetritheretri.json` with a Tier-1 row; handed-over maps without that row still fail consistency. A handed-over map without a matching Tier-1 row should fail consistency rather than be silently promoted or omitted.
- Enforcing formatting and complete-catalog validation can expose pre-existing data faults earlier. Record the actual failure, preserve source facts, and handle unrelated semantic fixes in their owning lane; do not weaken the checks to get green.
- Moving scripts can break direct `node validate.mjs` callers. Search repository callers and update them together; document npm commands as the supported interface. The external MCP's release payloads and filenames remain unchanged.
- Pinned-source verification checks citation existence/literals; it does not prove effective runtime values. Preserve the existing semantic-review requirement and SM64 regression. This refactor makes no new semantic-correctness claim.
- PR creation/push during implementation follows repository authorization and ownership rules. This request creates a planning document only; no implementation commits, remote PR, merge, or deployment are performed as part of drafting it.

## Planning verification

Inspected `README.md`, package scripts, both JavaScript CLIs, game schema, scout runner/brief, all three existing test suites, release workflow, Git status, and tracked/untracked layout. Dashboard health endpoint was unreachable during planning; telemetry is nonblocking. Implementation checks and AC evidence remain pending.
