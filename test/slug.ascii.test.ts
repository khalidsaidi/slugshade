import { describe, expect, it } from 'vitest';
import { slug } from '../src';

describe('slug (ascii)', () => {
  it('latin diacritics', () => {
    expect(slug('Český Krumlov', { alphabet: 'ascii' })).toBe('cesky-krumlov');
  });

  it('han -> hex tokens', () => {
    expect(slug('你好 世界', { alphabet: 'ascii' })).toBe('u4f60-u597d-u4e16-u754c');
  });

  it('emoji naming', () => {
    expect(slug('Ship it 🚀', { alphabet: 'ascii', emoji: 'name' })).toBe('ship-it-rocket');
  });

  it('tech + symbols', () => {
    expect(slug('C++ & C#', { alphabet: 'ascii', tech: true, symbols: 'basic' })).toBe(
      'cpp-and-csharp',
    );
  });
});
