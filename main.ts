// Launch Radar — entrypoint for the peer-calibrated board (Node 22, standard library only).
//
// Pipeline, in order:
//   1. read the sealed snapshot (--input <file|dir>, /input by default)
//   2. fit the peer evidence: per-category market-cap/TVL multiples of the protocols that trade
//   3. score every pre-token protocol (watchlist + the early radar below the floor)
//   4. write board.json, data.js, the dashboard, the screenshots, then dossier.json
//
// The dossier is byte-exact what vendor/makefun-board.ts's buildDossier writes, so it is written
// LAST from the finished /output. Deterministic by construction: no clock, no randomness, so two
// runs on the same snapshot write the same bytes.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

// The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse.
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const MIN_SCREENSHOTS = 3;

/** The value of `--name <value>` in the arguments, or `fallback`. Accepts `--name value` and `--name=value`. */
function arg(name: string, fallback: string): string {
  const spaced = process.argv.indexOf(`--${name}`);
  if (spaced >= 0 && spaced + 1 < process.argv.length) return process.argv[spaced + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

function fail(message: string): never {
  process.stderr.write(`launch radar: ${message}\n`);
  process.exit(1);
}

// ---- 1. the snapshot ----
const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`launch radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));

// ---- 2+3. fit the peers, score the board ----
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) fail(`the model wrote a board the gate refuses: ${issue}`);

// ---- 4. the outputs ----
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < MIN_SCREENSHOTS) fail(`screenshots/ holds ${shots.length}: hand in 3, the board, a detail view and a filtered view`);
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
}

// The dossier is written last, from the finished /output: the scorer rebuilds it and compares bytes.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS }),
);

const peers = radar.peer_table.length;
process.stdout.write(
  `launch radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} watchlisted, ` +
    `${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside, ` +
    `${peers} categories with peer evidence, global multiple ${radar.global_multiple})\n` +
  `launch radar: wrote board.json, data.js, dashboard/ (${3} files), screenshots/ (${shots.length}) and dossier.json in ${out}\n`,
);
