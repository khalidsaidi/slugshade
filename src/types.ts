export type Alphabet = 'unicode' | 'ascii';
export type Mode = 'classic' | 'semantic';
export type EmojiMode = 'remove' | 'keep' | 'name';
export type SymbolsMode = 'basic' | 'extended' | false;
export type UnknownMode = 'drop' | 'hex';

export interface SlugOptions {
  separator?: '-' | '_' | '.';
  lowercase?: boolean;
  locale?: string;
  maxLength?: number;
  alphabet?: Alphabet;
  mode?: Mode;
  strict?: boolean;

  emoji?: EmojiMode;
  symbols?: SymbolsMode;
  tech?: boolean;

  stopwords?: 'auto' | string[] | false;
  keepNumbers?: boolean;

  reserved?: string[];
  unknown?: UnknownMode;
  fallback?: string | ((input: string, ctx: { tokens: string[] }) => string);
}

export interface SlugStep {
  op: string;
  before?: string;
  after?: string;
  meta?: Record<string, unknown>;
}

export interface SlugDetailed {
  input: string;
  slug: string;
  tokens: string[];
  warnings: string[];
  steps: SlugStep[];
}

export type AISuggester = (ctx: {
  input: string;
  deterministic: string;
  locale: string;
  maxLength: number;
  separator: '-' | '_' | '.';
  alphabet: Alphabet;
  mode: Mode;
}) => Promise<string>;
