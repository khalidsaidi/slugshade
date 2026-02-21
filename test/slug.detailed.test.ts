import { describe, expect, it } from 'vitest';
import { slugDetailed } from '../src';

describe('slugDetailed', () => {
  it('returns steps + warnings', () => {
    const out = slugDetailed('Hello 🚀', { emoji: 'name', alphabet: 'ascii' });
    expect(out.slug).toBe('hello-rocket');
    expect(Array.isArray(out.steps)).toBe(true);
    expect(out.steps.length).toBeGreaterThan(5);
    expect(Array.isArray(out.warnings)).toBe(true);
  });
});
