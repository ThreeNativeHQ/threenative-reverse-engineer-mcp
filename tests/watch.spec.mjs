import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { frameName, offset, parseArgs, sampleTimes, section, seconds, tileGrid } from '../scripts/watch.mjs';
import { cleanup, root, tempDir, write, writeExecutable } from './support.mjs';

test('seconds accepts plain, mm:ss and hh:mm:ss', () => {
  assert.equal(seconds('90'), 90);
  assert.equal(seconds('1:30'), 90);
  assert.equal(seconds('01:02:03.5'), 3723.5);
  assert.throws(() => seconds('1:75'), /bad/);
  assert.throws(() => seconds('soon'), /bad/);
});

test('offset reads a whole-video share and defaults to the start', () => {
  assert.equal(offset(undefined, 600), 0);
  assert.equal(offset('50%', 600), 300);
  assert.equal(offset('1:00', 600), 60);
  assert.throws(() => offset('50%', null), /duration/);
  assert.throws(() => offset('120%', 600), /percent/);
});

test('sampleTimes centres one frame in each cell and spans the segment', () => {
  assert.deepEqual(sampleTimes(0, 90, 3), [15, 45, 75]);
  assert.equal(sampleTimes(10, 90, 12).length, 12);
  assert.ok(sampleTimes(10, 90, 12).every(at => at > 10 && at < 100));
});

test('tileGrid keeps at most one blank cell, so a blank reads as padding not a lost frame', () => {
  assert.deepEqual(tileGrid(1), { columns: 1, rows: 1 });
  assert.deepEqual(tileGrid(2), { columns: 2, rows: 1 });
  assert.deepEqual(tileGrid(4), { columns: 2, rows: 2 });
  assert.deepEqual(tileGrid(5), { columns: 3, rows: 2 });
  assert.deepEqual(tileGrid(6), { columns: 3, rows: 2 });
  assert.deepEqual(tileGrid(12), { columns: 3, rows: 4 });
});

test('section quotes a download window and frameName carries the timestamp', () => {
  assert.equal(section(30, 120), '*00:00:30-00:02:00');
  assert.equal(frameName(3, 12.44), '03-t12.4s.jpg');
});

test('parseArgs rejects unknown flags and bad counts', () => {
  assert.throws(() => parseArgs(['--nope']), /unknown flag/);
  assert.throws(() => parseArgs(['--frames', '0']), /at least one frame/);
  assert.throws(() => parseArgs(['--pick']), /missing value/);
  const options = parseArgs(['black', 'myth', 'wukong', 'parry', '--frames', '4', '--at', '1:30,0:10']);
  assert.equal(options.query, 'black myth wukong parry');
  assert.equal(options.frames, 4);
  assert.deepEqual(options.at, [10, 90]);
});

test('the watcher slices frames, a sheet and a manifest from the picked result', () => {
  const dir = tempDir('watch-');
  const output = path.join(dir, 'out');
  const search = JSON.stringify({
    entries: [
      { id: 'aaa', title: 'Long playthrough', channel: 'Someone', duration: 3600 },
      { id: 'bbb', title: 'Parry montage', channel: 'Other', duration: 120 },
    ],
  });
  // Fake tools: yt-dlp answers the search and leaves a clip; ffmpeg writes whatever path it is
  // given as its last argument, which is how the real one ends a command line.
  writeExecutable(dir, 'yt-dlp', `#!/bin/sh
case "$*" in
  *-J*) printf '%s' '${search}' ;;
  *)
    out=''
    while [ "$#" -gt 0 ]; do
      if [ "$1" = '-o' ]; then out=$2; fi
      shift
    done
    : > "$(printf '%s' "$out" | sed 's/%(ext)s/mp4/')"
    ;;
esac
`);
  writeExecutable(dir, 'ffmpeg', `#!/bin/sh
for a in "$@"; do out=$a; done
printf '%s' "$*" >> '${path.join(dir, 'ffmpeg.log')}'
printf '\\n' >> '${path.join(dir, 'ffmpeg.log')}'
printf 'jpeg' > "$out"
`);
  const result = spawnSync(process.execPath, ['scripts/watch.mjs', 'parry', 'timing', '--pick', '1', '--at', '100,130', '--out', output], {
    cwd: root,
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH}` },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Parry montage/);
  assert.match(result.stdout, /2 frames/);

  const frames = readdirSync(path.join(output, 'frames'));
  assert.deepEqual(frames, ['01-t100.0s.jpg', '02-t130.0s.jpg']);
  assert.ok(existsSync(path.join(output, 'sheet.jpg')));
  const manifest = JSON.parse(readFileSync(path.join(output, 'watch.json'), 'utf8'));
  assert.equal(manifest.video.id, 'bbb');
  assert.equal(manifest.video.url, 'https://www.youtube.com/watch?v=bbb');
  assert.equal(manifest.segment.from, 99, 'the window starts one second before the first timestamp');
  assert.equal(manifest.segment.seconds, 32);
  assert.equal(manifest.segment.sampled, 'timestamps');
  assert.deepEqual(manifest.frames.map(frame => frame.at), [100, 130]);
  assert.equal(manifest.frames[0].path, 'frames/01-t100.0s.jpg');
  assert.equal(manifest.sheet, 'sheet.jpg');
  assert.equal(manifest.clip, null, 'the clip is thrown away unless --keep asks for it');
  assert.match(manifest.note, /never commit/);
  // Seeks must be relative to the segment: yt-dlp rebases a downloaded section to zero.
  const seeks = readFileSync(path.join(dir, 'ffmpeg.log'), 'utf8').split('\n')
    .filter(line => line.includes('-ss')).map(line => line.split('-ss ')[1].split(' ')[0]);
  assert.deepEqual(seeks, ['1.00', '31.00']);
  cleanup(dir);
});

test('the watcher refuses a non-empty output folder', () => {
  const dir = tempDir('watch-');
  write(dir, 'busy/keep.txt', 'x');
  const result = spawnSync(process.execPath, ['scripts/watch.mjs', 'parry', '--out', path.join(dir, 'busy')], {
    cwd: root, encoding: 'utf8', timeout: 60_000,
    env: { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH}` },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not empty/);
  cleanup(dir);
});

test('the watcher needs search words', () => {
  const result = spawnSync(process.execPath, ['scripts/watch.mjs', '--frames', '4'], { cwd: root, encoding: 'utf8', timeout: 60_000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing search words/);
});
