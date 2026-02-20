import { describe, it, expect } from 'vitest';
import { lightModeCssVariablesResolver, mantineThemeOverride } from '../../theme';

describe('theme configuration', () => {
  it('uses lime as primary color', () => {
    expect(mantineThemeOverride.primaryColor).toBe('lime');
  });

  it('exposes light background color for the app shell', () => {
    expect(mantineThemeOverride.other?.['lightAppBackground']).toBe('#fffbf5');
  });

  it('forces softer default text color in light mode via css resolver', () => {
    const resolver = lightModeCssVariablesResolver(
      {} as Parameters<typeof lightModeCssVariablesResolver>[0]
    );
    expect(resolver.light['--mantine-color-text']).toBe('#2d2820');
    expect(resolver.light['--mantine-color-body']).toBe('#fffbf5');
    expect(resolver.dark).toEqual({ '--mantine-color-body': '#1c1610' });
    expect(resolver.variables).toEqual({});
  });
});
