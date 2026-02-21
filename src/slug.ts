import type { AISuggester, SlugDetailed, SlugOptions, SlugStep } from './types';
import { hashBase36 } from './internal/hash';
import { EMOJI_NAMES, RESERVED_DEFAULT, STOPWORDS_EN, SYMBOLS_BASIC, SYMBOLS_EXTENDED } from './internal/maps';
import { toAsciiTokens } from './internal/translit';

const DEFAULTS = {
  separator: '-' as const,
  lowercase: true,
  locale: 'en',
  maxLength: 80,
  alphabet: 'unicode' as const,
  mode: 'classic' as const,
  strict: true,

  emoji: 'remove' as const,
  symbols: 'basic' as const,
  tech: false,

  stopwords: false as const,
  keepNumbers: true,
  unknown: 'hex' as const,
};

const DASHES = /[‐‑‒–—―]/g;
const SMART_QUOTES = /[’‘]/g;
const SMART_QUOTES_DBL = /[“”]/g;
const ZERO_WIDTH_CHARS = ['\u200B', '\u200C', '\u200D', '\u2060', '\uFE0E', '\uFE0F'] as const;

let RE_CF: RegExp | null = null;
try {
  RE_CF = new RegExp('\\p{Cf}+', 'gu');
} catch {
  RE_CF = null;
}

let RE_WORD_FALLBACK: RegExp | null = null;
try {
  RE_WORD_FALLBACK = new RegExp('[\\p{L}\\p{M}\\p{N}]+', 'gu');
} catch {
  RE_WORD_FALLBACK = null;
}

let RE_EXT_PICT: RegExp | null = null;
try {
  RE_EXT_PICT = new RegExp('\\p{Extended_Pictographic}+', 'gu');
} catch {
  RE_EXT_PICT = null;
}

let RE_LN: RegExp | null = null;
let RE_M: RegExp | null = null;
try {
  RE_LN = new RegExp('[\\p{L}\\p{N}]', 'u');
  RE_M = new RegExp('[\\p{M}]', 'u');
} catch {
  RE_LN = null;
  RE_M = null;
}

function step(
  steps: SlugStep[] | null,
  op: string,
  before: string,
  after: string,
  meta?: Record<string, unknown>,
) {
  if (!steps) return;
  const entry: SlugStep = { op, before, after };
  if (meta !== undefined) entry.meta = meta;
  steps.push(entry);
}

function assertSeparator(sep: unknown): '-' | '_' | '.' {
  const s = (sep ?? DEFAULTS.separator) as string;
  if (s !== '-' && s !== '_' && s !== '.') throw new Error('separator must be "-", "_" or "."');
  return s;
}

function replaceControlCharsWithSpace(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0);
    if (typeof code !== 'number') continue;
    out += code <= 0x1f || code === 0x7f ? ' ' : ch;
  }
  return out;
}

function stripZeroWidthChars(input: string): string {
  let out = input;
  for (const ch of ZERO_WIDTH_CHARS) {
    out = out.split(ch).join('');
  }
  return out;
}

function normalizeInput(input: string): string {
  let s = String(input);
  s = s.normalize('NFKC');
  s = s.replace(DASHES, '-');
  s = s.replace(SMART_QUOTES, "'");
  s = s.replace(SMART_QUOTES_DBL, '"');
  s = replaceControlCharsWithSpace(s);
  s = stripZeroWidthChars(s);
  if (RE_CF) s = s.replace(RE_CF, '');
  s = s.replace(/[/\\]+/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function rewriteSymbols(s: string, mode: SlugOptions['symbols']): string {
  if (!mode) return s;
  const map = mode === 'extended' ? SYMBOLS_EXTENDED : SYMBOLS_BASIC;
  let out = s;
  for (const [k, v] of Object.entries(map)) {
    out = out.replaceAll(k, ` ${v} `);
  }
  return out.replace(/\s+/g, ' ').trim();
}

function rewriteTech(s: string, enabled: boolean): string {
  if (!enabled) return s;
  return s
    .replace(/c\+\+/gi, ' cpp ')
    .replace(/c#/gi, ' csharp ')
    .replace(/f#/gi, ' fsharp ')
    .replace(/\.net\b/gi, ' dotnet ')
    .replace(/\bnode\.js\b/gi, ' nodejs ')
    .replace(/\s+/g, ' ')
    .trim();
}

function rewriteEmoji(
  s: string,
  emoji: SlugOptions['emoji'],
  alphabet: SlugOptions['alphabet'],
): { out: string; used: 'remove' | 'keep' | 'name' } {
  const mode = alphabet === 'ascii' && emoji === 'keep' ? 'remove' : emoji;
  let out = s.replace(/[\uFE0E\uFE0F]/g, '');

  if (mode === 'name') {
    for (const [k, v] of Object.entries(EMOJI_NAMES)) {
      out = out.replaceAll(k, ` ${v} `);
    }
    if (RE_EXT_PICT) out = out.replace(RE_EXT_PICT, ' ');
    out = out.replace(/\s+/g, ' ').trim();
    return { out, used: 'name' };
  }

  if (mode === 'remove') {
    if (RE_EXT_PICT) out = out.replace(RE_EXT_PICT, ' ');
    for (const k of Object.keys(EMOJI_NAMES)) out = out.replaceAll(k, ' ');
    out = out.replace(/\s+/g, ' ').trim();
    return { out, used: 'remove' };
  }

  return { out, used: 'keep' };
}

function segmentTokens(
  s: string,
  locale: string,
): { tokens: string[]; warnings: string[]; usedSegmenter: boolean } {
  const warnings: string[] = [];
  const Seg = (globalThis as { Intl?: { Segmenter?: new (locales?: string | string[], options?: { granularity?: 'word' | 'sentence' | 'grapheme' }) => { segment: (input: string) => Iterable<{ segment: string; isWordLike?: boolean }> } } }).Intl?.Segmenter;

  if (Seg) {
    const seg = new Seg(locale, { granularity: 'word' });
    const tokens: string[] = [];
    for (const part of seg.segment(s)) {
      if (part.isWordLike) tokens.push(part.segment);
    }
    return { tokens, warnings, usedSegmenter: true };
  }

  warnings.push('intl-segmenter-unavailable');
  if (RE_WORD_FALLBACK) return { tokens: s.match(RE_WORD_FALLBACK) ?? [], warnings, usedSegmenter: false };
  return { tokens: s.split(/\s+/g).filter(Boolean), warnings, usedSegmenter: false };
}

function isAllDigits(token: string): boolean {
  for (const ch of token) {
    const code = ch.codePointAt(0);
    if (typeof code !== 'number') return false;
    if (code < 48 || code > 57) return false;
  }
  return token.length > 0;
}

function sanitizeStrict(slug: string, sep: string, alphabet: SlugOptions['alphabet']): string {
  let out = '';
  if (alphabet === 'ascii') {
    for (const ch of slug) {
      const code = ch.codePointAt(0);
      if (typeof code !== 'number') continue;
      if (ch === sep) {
        out += ch;
        continue;
      }
      if ((code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
        out += ch;
      }
    }
    return out;
  }

  let prevWasLN = false;
  for (const ch of slug) {
    if (ch === sep) {
      out += ch;
      prevWasLN = false;
      continue;
    }
    if (RE_LN && RE_LN.test(ch)) {
      out += ch;
      prevWasLN = true;
      continue;
    }
    if (prevWasLN && RE_M && RE_M.test(ch)) {
      out += ch;
      continue;
    }
  }
  return out;
}

function collapseAndTrimSeparators(slug: string, sep: string): string {
  if (!slug) return slug;
  const escaped = sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}{2,}`, 'g');
  let out = slug.replace(re, sep);
  out = out.replace(new RegExp(`^${escaped}+`), '');
  out = out.replace(new RegExp(`${escaped}+$`), '');
  return out;
}

function truncateAtBoundary(slug: string, sep: string, maxLength: number): string {
  if (slug.length <= maxLength) return slug;
  const cut = slug.slice(0, maxLength);
  const idx = cut.lastIndexOf(sep);
  const out = idx > 0 ? cut.slice(0, idx) : cut;
  return collapseAndTrimSeparators(out, sep);
}

function buildStopwords(locale: string, opt: SlugOptions['stopwords']): Set<string> | null {
  if (!opt) return null;
  if (Array.isArray(opt)) return new Set(opt.map((s) => s.toLowerCase()));
  if (opt === 'auto' && locale.toLowerCase().startsWith('en')) return STOPWORDS_EN;
  return null;
}

function fallbackSlug(
  normalizedInput: string,
  sep: string,
  tokens: string[],
  fallback: SlugOptions['fallback'],
): string {
  const h = hashBase36(normalizedInput).slice(0, 6);
  let base = 'untitled';

  if (typeof fallback === 'function') {
    const v = fallback(normalizedInput, { tokens });
    if (v && v.trim()) base = v.trim();
  } else if (typeof fallback === 'string' && fallback.trim()) {
    base = fallback.trim();
  }

  const escapedSep = sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  base = base
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, sep)
    .replace(new RegExp(`${escapedSep}{2,}`, 'g'), sep)
    .replace(new RegExp(`^${escapedSep}+|${escapedSep}+$`, 'g'), '');

  if (!base) base = 'untitled';
  return `${base}${sep}${h}`;
}

function internalSlug(
  inputRaw: string,
  opts: SlugOptions | undefined,
  steps: SlugStep[] | null,
): { slug: string; tokens: string[]; warnings: string[]; sep: '-' | '_' | '.' } {
  const o: SlugOptions = { ...DEFAULTS, ...(opts ?? {}) };
  const warnings: string[] = [];

  const sep = assertSeparator(o.separator);
  const locale = (o.locale ?? DEFAULTS.locale) || 'en';

  step(steps, 'normalize:input', '', String(inputRaw));

  const norm = normalizeInput(inputRaw);
  step(steps, 'normalize', String(inputRaw), norm);

  const tech = rewriteTech(norm, Boolean(o.tech));
  step(steps, 'tech', norm, tech, { enabled: Boolean(o.tech) });

  const sym = rewriteSymbols(tech, o.symbols);
  step(steps, 'symbols', tech, sym, { mode: o.symbols });

  const emojiRes = rewriteEmoji(sym, o.emoji, o.alphabet);
  step(steps, 'emoji', sym, emojiRes.out, { mode: emojiRes.used });

  const seg = segmentTokens(emojiRes.out, locale);
  warnings.push(...seg.warnings);
  step(steps, 'segment', emojiRes.out, seg.tokens.join(' | '), {
    usedSegmenter: seg.usedSegmenter,
    tokenCount: seg.tokens.length,
  });

  let tokens = seg.tokens;

  if (o.lowercase !== false) {
    const before = tokens.join(' ');
    tokens = tokens.map((t) => t.toLocaleLowerCase(locale));
    step(steps, 'lowercase', before, tokens.join(' '), { locale });
  }

  if (o.keepNumbers === false) {
    const before = tokens.join(' ');
    tokens = tokens.filter((t) => !isAllDigits(t));
    step(steps, 'keepNumbers', before, tokens.join(' '), { keepNumbers: false });
  }

  if (o.mode === 'semantic') {
    const sw = buildStopwords(locale, o.stopwords);
    const before = tokens.slice();
    if (sw) tokens = tokens.filter((t) => !sw.has(t));
    const dedup: string[] = [];
    for (const t of tokens) {
      if (dedup.length === 0 || dedup[dedup.length - 1] !== t) dedup.push(t);
    }
    tokens = dedup;
    step(steps, 'semantic', before.join(' '), tokens.join(' '), { stopwords: Boolean(sw) });
  }

  if (o.alphabet === 'ascii') {
    const before = tokens.join(' ');
    const asciiTokens: string[] = [];
    const unknown = o.unknown ?? DEFAULTS.unknown;
    for (const t of tokens) {
      const parts = toAsciiTokens(t, unknown);
      asciiTokens.push(...parts);
      if (unknown === 'hex' && parts.some((p) => p.startsWith('u'))) {
        warnings.push('unknown-script-hex-encoded');
      }
    }
    tokens = asciiTokens;
    step(steps, 'ascii', before, tokens.join(' '), { unknown });
  }

  let slug = tokens.filter(Boolean).join(sep);
  step(steps, 'join', tokens.join(' '), slug, { separator: sep });

  slug = slug.replace(/[/\\]+/g, sep);
  if (o.strict !== false) {
    const before = slug;
    slug = sanitizeStrict(slug, sep, o.alphabet);
    slug = collapseAndTrimSeparators(slug, sep);
    step(steps, 'strict', before, slug, { alphabet: o.alphabet });
  } else {
    slug = collapseAndTrimSeparators(slug, sep);
  }

  const reservedSet = new Set([...(o.reserved ?? []), ...Array.from(RESERVED_DEFAULT)]);
  if (!slug || slug === '.' || slug === '..') {
    warnings.push('fell-back');
    const fb = fallbackSlug(norm, sep, tokens, o.fallback);
    step(steps, 'fallback', slug, fb);
    slug = fb;
  }
  if (reservedSet.has(slug)) {
    const before = slug;
    slug = `${slug}${sep}1`;
    step(steps, 'reserved', before, slug);
  }

  const maxLength = o.maxLength ?? DEFAULTS.maxLength;
  if (typeof maxLength === 'number' && maxLength > 0) {
    const before = slug;
    slug = truncateAtBoundary(slug, sep, maxLength);
    if (slug !== before) step(steps, 'truncate', before, slug, { maxLength });
  }

  slug = collapseAndTrimSeparators(slug, sep);
  if (!slug) {
    warnings.push('fell-back');
    slug = fallbackSlug(norm, sep, tokens, o.fallback);
    step(steps, 'fallback-final', '', slug);
  }

  if (slug.includes('/') || slug.includes('\\')) {
    const before = slug;
    slug = collapseAndTrimSeparators(slug.replace(/[/\\]+/g, sep), sep);
    step(steps, 'no-slash', before, slug);
  }

  return { slug, tokens, warnings, sep };
}

export function slug(input: string, opts?: SlugOptions): string {
  return internalSlug(input, opts, null).slug;
}

export function slugDetailed(input: string, opts?: SlugOptions): SlugDetailed {
  const steps: SlugStep[] = [];
  const res = internalSlug(input, opts, steps);
  return { input, slug: res.slug, tokens: res.tokens, warnings: res.warnings, steps };
}

export function createSlugger(defaults: SlugOptions) {
  return (input: string, opts?: SlugOptions) => slug(input, { ...defaults, ...(opts ?? {}) });
}

export function uniqueSlug(
  base: string,
  isTaken: (candidate: string) => boolean,
  opts?: { separator?: '-' | '_' | '.'; max?: number },
): string {
  const sep = (opts?.separator ?? '-') as '-' | '_' | '.';
  const max = opts?.max ?? 1000;
  if (!isTaken(base)) return base;
  for (let i = 1; i <= max; i++) {
    const candidate = `${base}${sep}${i}`;
    if (!isTaken(candidate)) return candidate;
  }
  return `${base}${sep}${Date.now()}`;
}

export async function slugAsync(input: string, opts: SlugOptions & { ai: AISuggester }): Promise<string> {
  const { ai, ...rest } = opts;
  const deterministic = slug(input, rest);

  const o: SlugOptions = { ...DEFAULTS, ...rest };
  const locale = (o.locale ?? DEFAULTS.locale) || 'en';
  const separator = assertSeparator(o.separator);
  const maxLength = o.maxLength ?? DEFAULTS.maxLength;
  const alphabet = o.alphabet ?? DEFAULTS.alphabet;
  const mode = o.mode ?? DEFAULTS.mode;

  const candidate = await ai({
    input,
    deterministic,
    locale,
    maxLength,
    separator,
    alphabet,
    mode,
  });

  const sanitized = slug(candidate, rest);
  if (!sanitized || sanitized === '.' || sanitized === '..') return deterministic;
  return sanitized;
}
