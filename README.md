# SlugShade
Neon-grade slugs for every script. Cyber-native, Unicode-first, and built to be AI-friendly.

## Why SlugShade
- Unicode-first by default: keeps non-Latin scripts (Arabic, Cyrillic, Greek, Han, etc.) instead of stripping them away.
- ASCII mode that never returns empty: unknown scripts become stable `u<hex>` tokens.
- AI-native debugging: `slugDetailed()` returns a step-by-step trace of transformations.
- Optional AI hook: `slugAsync()` accepts your AI function, then SlugShade re-sanitizes deterministically.
- Zero runtime dependencies.

## Install
```bash
npm i slugshade
```

## Quick Start
```ts
import { slug, slugDetailed, slugAsync, presets } from 'slugshade';

slug('Hello, world!');
// => hello-world

slug('مرحبا بالعالم');
// => مرحبا-بالعالم

slug('你好 世界', { alphabet: 'ascii' });
// => u4f60-u597d-u4e16-u754c

slug('C++ & C#', { ...presets.safe });
// => cpp-and-csharp

const traced = slugDetailed('Hello 🚀', { alphabet: 'ascii', emoji: 'name' });
// traced.steps => normalization / symbols / emoji / segmentation / strict / ...

const aiSlug = await slugAsync('How to ship fast', {
  ...presets.cyber,
  ai: async ({ deterministic }) => `🔥 ${deterministic}`,
});
// => fire-how-ship-fast
```

## API
### `slug(input, options?)`
Returns a deterministic slug string.

### `slugDetailed(input, options?)`
Returns:
- `slug`
- `tokens`
- `warnings`
- `steps` transformation trace

### `slugAsync(input, { ...options, ai })`
Runs your AI suggester and then re-sanitizes output with the same deterministic rules.

### `createSlugger(defaults)`
Returns a reusable function with preconfigured defaults.

### `uniqueSlug(base, isTaken, opts?)`
Finds an available suffix (`-1`, `-2`, ...).

## Options
```ts
type SlugOptions = {
  separator?: '-' | '_' | '.';
  lowercase?: boolean;
  locale?: string;
  maxLength?: number;
  alphabet?: 'unicode' | 'ascii';
  mode?: 'classic' | 'semantic';
  strict?: boolean;
  emoji?: 'remove' | 'keep' | 'name';
  symbols?: 'basic' | 'extended' | false;
  tech?: boolean;
  stopwords?: 'auto' | string[] | false;
  keepNumbers?: boolean;
  reserved?: string[];
  unknown?: 'drop' | 'hex';
  fallback?: string | ((input: string, ctx: { tokens: string[] }) => string);
};
```

## Presets
- `presets.safe`: strict ASCII output with symbol and tech rewrites.
- `presets.cyber`: semantic + emoji naming + ASCII output.
- `presets.unicode`: semantic + emoji naming, Unicode output.

## Safety Guarantees
- Never returns `.` or `..`
- Never returns slashes
- Handles reserved names (`admin`, `api`, `con`, `nul`, etc.)
- Fallback always produces a stable slug with hash suffix

## Development
```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run publint
```

## Publish Checklist
```bash
npm run prepublishOnly
npm pack --dry-run
```

## License
MIT
