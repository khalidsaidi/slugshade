import { describe, expect, it } from 'vitest';
import { slug } from '../src';

describe('slug (unicode default)', () => {
  it('basic english', () => {
    expect(slug('Hello, world!')).toBe('hello-world');
  });

  it('arabic', () => {
    expect(slug('مرحبا بالعالم')).toBe('مرحبا-بالعالم');
  });

  it('cyrillic', () => {
    expect(slug('Привет мир')).toBe('привет-мир');
  });

  it('greek', () => {
    expect(slug('Γειά σου Κόσμε')).toBe('γειά-σου-κόσμε');
  });

  it('han with spaces', () => {
    expect(slug('你好 世界')).toBe('你好-世界');
  });
});
