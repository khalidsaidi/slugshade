import { CYRILLIC_MAP, GREEK_MAP, LATIN_SPECIAL_MAP } from './maps';
import type { UnknownMode } from '../types';

let RE_MARKS: RegExp | null = null;
try {
  RE_MARKS = new RegExp('\\p{M}+', 'gu');
} catch {
  RE_MARKS = null;
}

export function toAsciiTokens(token: string, unknown: UnknownMode): string[] {
  let s = token.normalize('NFKD');
  if (RE_MARKS) s = s.replace(RE_MARKS, '');

  const out: string[] = [];
  let buf = '';

  const flush = () => {
    if (buf) out.push(buf);
    buf = '';
  };

  for (const ch of s) {
    const lower = ch.toLowerCase();

    if (LATIN_SPECIAL_MAP[lower]) {
      buf += LATIN_SPECIAL_MAP[lower];
      continue;
    }
    if (GREEK_MAP[lower]) {
      buf += GREEK_MAP[lower];
      continue;
    }
    if (CYRILLIC_MAP[lower]) {
      buf += CYRILLIC_MAP[lower];
      continue;
    }

    const code = ch.codePointAt(0);
    if (typeof code !== 'number') continue;

    if ((code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
      buf += lower;
      continue;
    }

    if (code > 127) {
      if (unknown === 'hex') {
        flush();
        out.push('u' + code.toString(16));
      }
      continue;
    }
  }

  flush();
  return out.filter(Boolean);
}
