import type { SlugOptions } from './types';

export const presets = {
  safe: {
    alphabet: 'ascii',
    unknown: 'hex',
    emoji: 'remove',
    symbols: 'basic',
    tech: true,
    mode: 'classic',
    maxLength: 80,
    strict: true,
    lowercase: true,
    separator: '-',
  } satisfies SlugOptions,

  cyber: {
    alphabet: 'ascii',
    unknown: 'hex',
    emoji: 'name',
    symbols: 'extended',
    tech: true,
    mode: 'semantic',
    stopwords: 'auto',
    maxLength: 60,
    strict: true,
    lowercase: true,
    separator: '-',
  } satisfies SlugOptions,

  unicode: {
    alphabet: 'unicode',
    emoji: 'name',
    symbols: 'extended',
    tech: true,
    mode: 'semantic',
    stopwords: 'auto',
    maxLength: 80,
    strict: true,
    lowercase: true,
    separator: '-',
  } satisfies SlugOptions,
} as const;
