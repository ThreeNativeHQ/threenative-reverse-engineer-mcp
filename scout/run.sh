#!/bin/sh
set -eu

usage() {
  printf 'usage: sh scout/run.sh <id> <repo-url> <40-hex-sha>\n' >&2
  exit 2
}

[ "$#" -eq 3 ] || usage
id=$1
repo=$2
sha=$3
printf '%s\n' "$id" | grep -Eq '^[a-z0-9][a-z0-9-]*$' || usage
printf '%s\n' "$sha" | grep -Eq '^[0-9a-f]{40}$' || usage

mkdir -p .sources
[ -d ".sources/$id" ] || git init --bare ".sources/$id"
git -C ".sources/$id" fetch --depth=1 "$repo" "$sha"
[ -d ".sources/$id-tree" ] || git -C ".sources/$id" worktree add --detach "../$id-tree" "$sha"

prompt="$(cat scout/BRIEF.md)

Game id: $id
Repo: $repo
SHA: $sha
Source tree to read: .sources/$id-tree
Write: game-$id.json at the repo root"

# SCOUT_ARM=<wrapper> runs the scout through a wrapper that takes <workdir> <brief file>
# (for example the save-tokens arm.sh) when the dsh DeepSeek balance is empty.
printf '%s\n' "$prompt" > ".sources/$id.brief.md"
if [ -n "${SCOUT_ARM:-}" ]; then
  "$SCOUT_ARM" "$PWD" ".sources/$id.brief.md" 2>&1 | tee ".sources/$id.scout.log"
else
  PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH" \
  DSH_PERMISSION_MODE=danger-full-access \
  DSH_TELEMETRY_MODE=DISABLED \
  dsh --profile headless "$prompt" 2>&1 | tee ".sources/$id.scout.log"
fi

node validate.mjs --source ".sources/$id" --game "$id"
