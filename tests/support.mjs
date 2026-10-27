// Disposable library fixtures for CLI-level checks. Everything lives under node_modules/
// so Node still resolves ajv from the repository while npm sees a standalone package.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, cpSync, rmSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('..', import.meta.url));
const scratch = path.join(root, 'node_modules', '.fixtures');
export const canonical = value => `${JSON.stringify(value, null, 2)}\n`;

export function tempDir(prefix = 'case-') {
  mkdirSync(scratch, { recursive: true });
  return mkdtempSync(path.join(scratch, prefix));
}

export function write(dir, name, text) {
  const file = path.join(dir, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof text === 'string' ? text : canonical(text));
  return file;
}

export function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

export function makeLibrary({ catalog = [catalogRow()], games = [], copyData = false } = {}) {
  const dir = tempDir('library-');
  cpSync(path.join(root, 'scripts'), path.join(dir, 'scripts'), { recursive: true });
  cpSync(path.join(root, 'schemas'), path.join(dir, 'schemas'), { recursive: true });
  cpSync(path.join(root, 'package.json'), path.join(dir, 'package.json'));
  mkdirSync(path.join(dir, 'data', 'games'), { recursive: true });
  if (copyData) cpSync(path.join(root, 'data'), path.join(dir, 'data'), { recursive: true });
  else write(dir, 'data/catalog.json', catalog);
  for (const game of games) write(dir, `data/games/${game.id}.json`, canonical(game));
  return dir;
}

export const runNode = (dir, args, env = {}) =>
  spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
export const runNpm = (dir, args, env = {}) =>
  spawnSync('npm', ['run', '--silent', ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });

const pad = count => Array.from({ length: count }, () => '// padding');
export const sourceFiles = {
  'src/game/mario.c': ['// player update', 'void update_mario(void) {', '}'],
  'src/game/mario_actions_airborne.c': [
    ...pad(9),
    'void act_triple_jump(void) {',
    '  f32 launchSpeed;',
    '  launchSpeed = 69;',
    ...pad(21),
    '}',
    ...pad(27),
  ],
  'src/game/camera.c': [
    ...pad(39),
    'void update_camera(void) {',
    ...pad(20),
  ],
};

export function makeSourceRepo() {
  const dir = tempDir('source-');
  const git = (...args) => execFileSync('git', ['-C', dir, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args], { encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  for (const [name, lines] of Object.entries(sourceFiles)) write(dir, name, `${lines.join('\n')}\n`);
  git('add', '-A');
  git('commit', '-q', '-m', 'fixture');
  return { dir, sha: git('rev-parse', 'HEAD').trim() };
}

export const catalogRow = (id = 'demo') => ({ id, title: `Demo ${id}`, platform: 'PC / DOS', repo: `https://github.com/example/${id}`, tier: 1, kind: 'decompilation', rating: 5, genre: 'platformer' });

export function demoGame(sha, id = 'demo') {
  const node = (name, extra) => ({ id: name, name, purpose: `${name} purpose`, paths: ['src/game/mario.c'], functions: [], dependsOn: [], ...extra });
  return {
    version: 1,
    id,
    title: 'Demo game',
    repo: `https://github.com/example/${id}`,
    sha,
    nodes: [
      node('player'),
      node('airborne', {
        parent: 'player',
        paths: ['src/game/mario_actions_airborne.c'],
        functions: [{ name: 'act_triple_jump', path: 'src/game/mario_actions_airborne.c', lines: [10, 30] }],
      }),
      node('camera', {
        paths: ['src/game/camera.c'],
        functions: [{ name: 'update_camera', path: 'src/game/camera.c', lines: [40, 45] }],
        dependsOn: ['player'],
      }),
    ],
    cards: [{
      id: 'triple-jump',
      node: 'airborne',
      name: 'Triple jump',
      summary: 'Three timed jumps launch higher',
      behavior: 'Chain jumps while moving.',
      constants: [{ name: 'launchSpeed', value: 69, unit: 'units/frame', source: 'src/game/mario_actions_airborne.c:12' }],
      sources: [{ path: 'src/game/mario_actions_airborne.c', line: 12 }],
      capabilities: [],
      tags: ['jump'],
    }],
  };
}

export function writeExecutable(dir, name, body) {
  const file = write(dir, name, body);
  chmodSync(file, 0o755);
  return file;
}
