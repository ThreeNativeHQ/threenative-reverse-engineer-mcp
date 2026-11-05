// Gameplay watcher: search YouTube for a gameplay video of a mechanic reference, slice frames
// out of one segment and drop them, plus a contact sheet, into a tmp folder for the agent to look
// at. Needs `yt-dlp` (search and download) and `ffmpeg` (frames) on PATH.
import { execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const usage = `usage: node scripts/watch.mjs <game mechanic words> [options]

  --pick N        use search result N (default 0, the top one)
  --from T        segment start: seconds, mm:ss, hh:mm:ss, or NN% of the video (default 10%, past the intro)
  --duration T    seconds of gameplay to sample (default 90)
  --frames N      frames to slice from the segment (default 12)
  --at T[,T...]   exact timestamps to slice instead of even sampling
  --out DIR       output folder (default: a fresh mkdtemp under the system tmp)
  --keep          keep the downloaded clip next to the frames
  --help          print this text

Slices at 640px wide, named frames/NN-tSECONDSs.jpg, plus sheet.jpg (one image, all frames).
Frames are reference material for editing a mechanic: never commit them.`;

export function seconds(value, label = 'time') {
  const text = String(value ?? '').trim();
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/u.test(text)) throw new Error(`bad ${label}: ${value}`);
  const parts = text.split(':').map(Number);
  if (parts.slice(1).some(part => part >= 60)) throw new Error(`bad ${label}: ${value}`);
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/** Segment start: plain time or a share of the whole video, which is how you guess your way into
 *  the middle of a long playthrough when the search result is two hours long. */
export function offset(value, durationSeconds) {
  if (value === undefined || value === '0') return 0;
  if (!String(value).trim().endsWith('%')) return seconds(value, '--from');
  const share = Number(String(value).trim().slice(0, -1));
  if (!Number.isFinite(share) || share < 0 || share > 100) throw new Error(`bad --from percent: ${value}`);
  if (!durationSeconds) throw new Error('--from percent needs a video duration from the search result');
  return durationSeconds * share / 100;
}

/** Even sampling: one frame in the middle of each of N cells, so both ends of the segment show. */
export const sampleTimes = (from, duration, frames) =>
  Array.from({ length: frames }, (_, index) => from + (index + 0.5) * duration / frames);

export const frameName = (index, at) => `${String(index).padStart(2, '0')}-t${at.toFixed(1)}s.jpg`;

export function tileGrid(count) {
  const columns = Math.min(3, Math.max(1, count));
  return { columns, rows: Math.ceil(count / columns) };
}

const clock = value => [Math.floor(value / 3600), Math.floor(value / 60) % 60, Math.floor(value % 60)]
  .map(part => String(part).padStart(2, '0')).join(':');

export const section = (from, to) => `*${clock(from)}-${clock(to)}`;

export function parseArgs(args) {
  const options = { duration: 90, frames: 12, pick: 0, keep: false, words: [] };
  const valued = new Set(['--pick', '--from', '--duration', '--frames', '--at', '--out']);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') { options.help = true; continue; }
    if (arg === '--keep') { options.keep = true; continue; }
    if (valued.has(arg)) {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`missing value for ${arg}`);
      options[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--')) throw new Error(`unknown flag ${arg}`);
    options.words.push(arg);
  }
  const whole = name => {
    const value = Number(options[name]);
    if (!Number.isInteger(value) || value < 0) throw new Error(`bad --${name}: ${options[name]}`);
    return value;
  };
  options.frames = whole('frames');
  options.pick = whole('pick');
  options.duration = whole('duration');
  if (options.frames < 1) throw new Error('--frames needs at least one frame');
  if (options.duration < 1) throw new Error('--duration needs at least one second');
  if (options.at) {
    const times = String(options.at).split(',').map(part => seconds(part, '--at'));
    if (!times.length) throw new Error(`bad --at: ${options.at}`);
    options.at = times.sort((left, right) => left - right);
  }
  options.query = options.words.join(' ').trim();
  return options;
}

function tool(name, hint) {
  const found = [process.env.PATH ?? '', path.join(os.homedir(), '.local', 'bin')]
    .join(path.delimiter).split(path.delimiter)
    .map(directory => path.join(directory, name))
    .find(file => existsSync(file));
  if (!found) throw new Error(`${name} not found on PATH${hint ? `: ${hint}` : ''}`);
  return found;
}

async function search(bin, query) {
  const { stdout } = await execute(bin, ['--flat-playlist', '-J', `ytsearch5:${query}`], { maxBuffer: 64 * 1024 * 1024 });
  return (JSON.parse(stdout).entries ?? []).filter(entry => entry.id).map(entry => ({
    id: entry.id,
    title: entry.title ?? entry.id,
    channel: entry.channel ?? entry.uploader ?? '',
    durationSeconds: entry.duration ?? null,
    url: `https://www.youtube.com/watch?v=${entry.id}`,
  }));
}

async function download(bin, video, from, length, folder) {
  try {
    await execute(bin, [
      '--no-playlist', '--no-warnings', '--no-progress', '--force-overwrites',
      '--merge-output-format', 'mp4',
      '--download-sections', section(from, from + length),
      '-f', 'bv*[height<=480]+ba/b[height<=480]/b',
      '-o', path.join(folder, 'clip.%(ext)s'),
      video.url,
    ], { maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    const tail = String(error.stderr ?? error.message).trim().split('\n').slice(-3).join(' ');
    throw new Error(`download failed for ${video.url}: ${tail}`);
  }
  const clip = readdirSync(folder).find(name => name.startsWith('clip.'));
  if (!clip) throw new Error(`download produced no clip for ${video.url}`);
  return path.join(folder, clip);
}

async function slice(bin, clip, times, from, folder) {
  const written = [];
  for (const [position, at] of times.entries()) {
    const file = path.join(folder, frameName(position + 1, at));
    // yt-dlp rebases a downloaded section to 0, so the seek is relative to the segment start.
    const seek = Math.max(0, at - from);
    try {
      await execute(bin, ['-nostdin', '-loglevel', 'error', '-ss', seek.toFixed(2), '-i', clip,
        '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '3', '-y', file]);
      if (existsSync(file) && statSync(file).size) written.push({ index: position + 1, at, file });
    } catch {
      // A time past the end of the downloaded clip yields no frame and is dropped.
    }
  }
  return written;
}

async function contactSheet(bin, frames, folder, file) {
  if (!frames.length) return null;
  const { columns, rows } = tileGrid(frames.length);
  await execute(bin, ['-nostdin', '-loglevel', 'error', '-pattern_type', 'glob',
    '-i', path.join(folder, '*.jpg'), '-vf', `tile=${columns}x${rows}:padding=6:margin=6`,
    '-frames:v', '1', '-q:v', '3', '-y', file]);
  return existsSync(file) ? file : null;
}

export async function watch(args) {
  const options = parseArgs(args);
  if (options.help) { console.log(usage); return; }
  if (!options.query) throw new Error(`missing search words\n\n${usage}`);
  const ytDlp = tool('yt-dlp', 'install it with `pipx install yt-dlp`');
  const ffmpeg = tool('ffmpeg');
  const folder = options.out ? path.resolve(options.out) : mkdtempSync(path.join(os.tmpdir(), 'threenative-watch-'));
  if (options.out) {
    if (existsSync(folder) && readdirSync(folder).length) throw new Error(`output folder is not empty: ${folder}`);
    mkdirSync(folder, { recursive: true });
  }

  const candidates = await search(ytDlp, options.query);
  if (!candidates.length) throw new Error(`no YouTube result for "${options.query}"`);
  candidates.forEach((video, position) => console.log(`[${position}] ${video.durationSeconds ? clock(video.durationSeconds) : '--:--'} ${video.title}${video.channel ? ` — ${video.channel}` : ''}`));
  const video = candidates[options.pick];
  if (!video) throw new Error(`--pick ${options.pick} but the search returned ${candidates.length}`);

  const from = options.at
    ? Math.max(0, options.at[0] - 1)
    : offset(options.from ?? '10%', video.durationSeconds);
  const length = options.at
    ? Math.max(1, options.at.at(-1) + 1 - from)
    : options.duration;
  const times = options.at ?? sampleTimes(from, length, options.frames);

  const framesFolder = path.join(folder, 'frames');
  mkdirSync(framesFolder, { recursive: true });

  const clip = await download(ytDlp, video, from, length, folder);
  const frames = await slice(ffmpeg, clip, times, from, framesFolder);
  if (!frames.length) throw new Error(`no frame sliced from ${video.url} between ${clock(from)} and ${clock(from + length)}`);
  const sheetFile = await contactSheet(ffmpeg, frames, framesFolder, path.join(folder, 'sheet.jpg'));
  if (!options.keep) unlinkSync(clip);
  const keptClip = options.keep ? path.basename(clip) : null;

  const relative = file => path.relative(folder, file);
  writeFileSync(path.join(folder, 'watch.json'), `${JSON.stringify({
    version: 1,
    query: options.query,
    video: { id: video.id, title: video.title, channel: video.channel, url: video.url, durationSeconds: video.durationSeconds },
    segment: { from, seconds: length, sampled: Boolean(options.at) ? 'timestamps' : 'even' },
    frames: frames.map(frame => ({ index: frame.index, at: Number(frame.at.toFixed(2)), path: relative(frame.file) })),
    sheet: sheetFile ? relative(sheetFile) : null,
    clip: keptClip,
    note: 'Gameplay frames for studying a mechanic. Reference only: not redistributable, never commit.',
  }, null, 2)}\n`);

  console.log(`\n${video.title} @ ${clock(from)} +${Math.round(length)}s → ${frames.length} frames`);
  console.log(`watch: ${folder}`);
  if (sheetFile) console.log(`look: ${sheetFile}`);
}

export function run(args = process.argv.slice(2)) {
  return watch(args);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch(error => { console.error(error.message); process.exitCode = 1; });
}
