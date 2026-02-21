# Decisions
- Default output preserves non-Latin scripts (Unicode slugs are valid; browsers/servers may percent-encode).
- ASCII mode exists for strict ASCII needs; unknown scripts become stable `u<hex>` tokens (never empty).
- `slugDetailed()` returns a step-by-step trace to be AI-native and debuggable.
- `slugAsync()` accepts a user-supplied AI suggester and then re-sanitizes deterministically (no bundled LLM).
- `.ai/` is for agent artifacts and is excluded from npm by package.json "files".
