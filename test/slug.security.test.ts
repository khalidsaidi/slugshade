import { describe, expect, it } from 'vitest';
import { slug } from '../src';

describe('safety', () => {
  it('never returns dot or dotdot', () => {
    const a = slug('.');
    const b = slug('..');
    expect(a).not.toBe('.');
    expect(a).not.toBe('..');
    expect(b).not.toBe('.');
    expect(b).not.toBe('..');
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
  });

  it('never contains slashes', () => {
    const s = slug('a/b\\c');
    expect(s.includes('/')).toBe(false);
    expect(s.includes('\\')).toBe(false);
  });
});
