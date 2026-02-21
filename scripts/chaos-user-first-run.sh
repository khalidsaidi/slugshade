#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FUZZ_CASES="${CHAOS_FUZZ_CASES:-1200}"
KEEP_TMP="${CHAOS_KEEP_TMP:-0}"

if ! [[ "$FUZZ_CASES" =~ ^[0-9]+$ ]] || [[ "$FUZZ_CASES" -lt 1 ]]; then
  echo "CHAOS_FUZZ_CASES must be a positive integer (got: $FUZZ_CASES)"
  exit 1
fi

cd "$ROOT_DIR"

echo "[chaos] Building package..."
npm run build >/tmp/slugshade-chaos-build.log

echo "[chaos] Packing package tarball..."
PKG_TGZ="$(npm pack --silent)"
TMP_DIR="$(mktemp -d /tmp/slugshade-chaos-XXXXXX)"

cleanup() {
  local exit_code=$?
  rm -f "$ROOT_DIR/$PKG_TGZ"
  if [[ "$KEEP_TMP" == "1" || "$exit_code" -ne 0 ]]; then
    echo "[chaos] Temp project kept at: $TMP_DIR"
  else
    rm -rf "$TMP_DIR"
  fi
}
trap cleanup EXIT

echo "[chaos] Creating isolated first-time-user project at $TMP_DIR"
cd "$TMP_DIR"
npm init -y >/dev/null
npm i "$ROOT_DIR/$PKG_TGZ" >/dev/null

echo "[chaos] Running ESM smoke + behavior checks..."
node --input-type=module <<'EOF'
import {
  createSlugger,
  presets,
  slug,
  slugAsync,
  slugDetailed,
  uniqueSlug,
} from 'slugshade';
import { presets as subpathPresets } from 'slugshade/presets';

const failures = [];
const check = (ok, msg) => {
  if (!ok) failures.push(msg);
};

const cases = [
  '',
  '   ',
  '.',
  '..',
  'a/b\\c',
  'CON',
  'nul',
  'admin',
  'مرحبا بالعالم',
  'Привет мир',
  'Γειά σου Κόσμε',
  '你好 世界',
  'C++ & C#',
  'Ship it 🚀🔥',
  '👨‍👩‍👧‍👦 family + 🇺🇸 flag',
  '\u0000bad\u001Fcontrol',
  '𝒻𝓊𝓁𝓁 ｗｉｄｔｈ ＆ symbols %%%',
  '...////\\\\',
  'drop table users; --',
  '      🧠      ',
];

const optionSets = [
  undefined,
  { alphabet: 'ascii' },
  { ...presets.safe },
  { ...presets.cyber },
  { ...presets.unicode },
  { alphabet: 'ascii', emoji: 'name', tech: true, symbols: 'extended' },
  { alphabet: 'unicode', mode: 'semantic', stopwords: 'auto', tech: true },
];

for (const input of cases) {
  for (const opts of optionSets) {
    const out = slug(input, opts);
    check(typeof out === 'string' && out.length > 0, `empty output for ${JSON.stringify(input)}`);
    check(!out.includes('/') && !out.includes('\\'), `unsafe slash in output: ${out}`);
    check(out !== '.' && out !== '..', `dot-path output: ${out}`);
  }
}

const detailed = slugDetailed('Hello 🚀', { alphabet: 'ascii', emoji: 'name' });
check(Array.isArray(detailed.steps) && detailed.steps.length >= 3, 'slugDetailed trace too short');

const aiOut = await slugAsync('How to ship fast', {
  ...presets.cyber,
  ai: async ({ deterministic }) => `../../🔥 ${deterministic} \\ ..`,
});
check(Boolean(aiOut), 'slugAsync returned empty output');
check(!aiOut.includes('/') && !aiOut.includes('\\'), `slugAsync slash output: ${aiOut}`);
check(aiOut !== '.' && aiOut !== '..', `slugAsync dot-path output: ${aiOut}`);

const mk = createSlugger({ alphabet: 'ascii', tech: true });
const fixed = mk('C++ on .NET');
check(fixed === 'cpp-on-dotnet', `createSlugger mismatch: ${fixed}`);

const taken = new Set(['doc', 'doc-1', 'doc-2']);
const uniq = uniqueSlug('doc', (candidate) => taken.has(candidate));
check(uniq === 'doc-3', `uniqueSlug mismatch: ${uniq}`);

check(
  JSON.stringify(subpathPresets.safe) === JSON.stringify(presets.safe),
  'subpath presets mismatch',
);

if (failures.length) {
  console.error('ESM failures:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('esm-chaos: PASS');
EOF

echo "[chaos] Running CJS smoke checks..."
node <<'EOF'
const { presets, slug, slugDetailed } = require('slugshade');
const { presets: subpathPresets } = require('slugshade/presets');

const a = slug('Hello, world!');
const b = slug('你好 世界', { alphabet: 'ascii' });
const d = slugDetailed('Ship it 🚀', { alphabet: 'ascii', emoji: 'name' });

if (a !== 'hello-world') throw new Error(`unexpected CJS basic: ${a}`);
if (!b.startsWith('u4f60-u597d')) throw new Error(`unexpected CJS Han-ascii: ${b}`);
if (!Array.isArray(d.steps) || d.steps.length < 3) throw new Error('missing CJS detailed steps');
if (JSON.stringify(presets.cyber) !== JSON.stringify(subpathPresets.cyber)) {
  throw new Error('CJS subpath presets mismatch');
}

console.log('cjs-chaos: PASS');
EOF

echo "[chaos] Running randomized fuzz checks ($FUZZ_CASES cases)..."
CHAOS_FUZZ_CASES="$FUZZ_CASES" node --input-type=module <<'EOF'
import { slug } from 'slugshade';

const total = Number(process.env.CHAOS_FUZZ_CASES ?? '1200');

const randInt = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[randInt(arr.length)];

const pools = [
  () => String.fromCharCode(randInt(0x7f)),
  () => String.fromCodePoint(0x0600 + randInt(0x06ff - 0x0600)),
  () => String.fromCodePoint(0x0400 + randInt(0x04ff - 0x0400)),
  () => String.fromCodePoint(0x4e00 + randInt(0x9fff - 0x4e00)),
  () => pick(['🚀', '🔥', '🧠', '👨‍👩‍👧‍👦', '⚡', '✅']),
  () => pick(['/', '\\\\', '.', '..', '   ', '%', '&', '@', '+', '#']),
];

const makeChaosString = () => {
  const len = 1 + randInt(32);
  let s = '';
  for (let i = 0; i < len; i++) s += pools[randInt(pools.length)]();
  return s;
};

const seps = ['-', '_', '.'];
const alphabets = ['unicode', 'ascii'];
const emojis = ['remove', 'keep', 'name'];
const symbols = ['basic', 'extended', false];
const modes = ['classic', 'semantic'];
const unknowns = ['drop', 'hex'];

const failures = [];

for (let i = 0; i < total; i++) {
  const input = makeChaosString();
  const opts = {
    separator: pick(seps),
    alphabet: pick(alphabets),
    emoji: pick(emojis),
    symbols: pick(symbols),
    mode: pick(modes),
    unknown: pick(unknowns),
    strict: true,
    tech: Math.random() > 0.5,
    maxLength: 10 + randInt(90),
  };

  let out = '';
  try {
    out = slug(input, opts);
  } catch (err) {
    failures.push(`throw[${i}]: ${String(err)}`);
    continue;
  }

  if (!out || typeof out !== 'string') failures.push(`empty[${i}]`);
  if (out === '.' || out === '..') failures.push(`dotpath[${i}]: ${out}`);
  if (out.includes('/') || out.includes('\\')) failures.push(`slash[${i}]: ${out}`);
  if (out.length > opts.maxLength + 8) failures.push(`len[${i}]: ${out.length}`);
  if (opts.alphabet === 'ascii' && /[^a-z0-9._-]/.test(out)) {
    failures.push(`ascii[${i}]: ${out}`);
  }
}

if (failures.length) {
  console.error(`fuzz failures=${failures.length}`);
  for (const failure of failures.slice(0, 30)) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`fuzz-chaos: PASS (${total} cases)`);
EOF

echo "[chaos] PASS"
