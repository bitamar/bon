import { describe, expect, it } from 'vitest';
import { escapeLikePattern } from '../../src/lib/query-utils.js';

describe('escapeLikePattern', () => {
  it('escapes percent wildcard', () => {
    expect(escapeLikePattern('100%')).toBe('100\\%');
  });

  it('escapes underscore wildcard', () => {
    expect(escapeLikePattern('a_b')).toBe('a\\_b');
  });

  it('escapes backslash', () => {
    expect(escapeLikePattern('path\\to')).toBe('path\\\\to');
  });

  it('escapes all special characters in a single string', () => {
    expect(escapeLikePattern('%_\\')).toBe('\\%\\_\\\\');
  });

  it('returns clean strings unchanged', () => {
    expect(escapeLikePattern('hello world')).toBe('hello world');
  });
});
