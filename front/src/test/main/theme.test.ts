import { describe, it, expect } from 'vitest';
import { bonTheme, cssVariablesResolver } from '../../theme/theme';

describe('theme configuration', () => {
  it('uses brand as primary color', () => {
    expect(bonTheme.primaryColor).toBe('brand');
  });

  it('defines brand color scale with 10 shades', () => {
    expect(bonTheme.colors?.['brand']).toHaveLength(10);
  });

  it('sets body background and text color in light mode via css resolver', () => {
    const resolver = cssVariablesResolver({} as Parameters<typeof cssVariablesResolver>[0]);
    expect(resolver.light['--mantine-color-text']).toBe('#1a2332');
    expect(resolver.light['--mantine-color-body']).toBe('#f8f9fb');
    expect(resolver.dark).toEqual({ '--mantine-color-body': '#1c1610' });
    expect(resolver.variables).toEqual({});
  });
});
