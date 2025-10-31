import { describe, it, expect } from 'vitest';
import { lightModeCssVariablesResolver, mantineThemeOverride } from '../../theme';

describe('theme configuration', () => {
  it('exposes light background color for the app shell', () => {
    expect(mantineThemeOverride.other?.['lightAppBackground']).toBe('#f0fafa');
  });

  it('forces softer default text color in light mode via css resolver', () => {
    const resolver = lightModeCssVariablesResolver(
      {} as Parameters<typeof lightModeCssVariablesResolver>[0]
    );
    expect(resolver.light['--mantine-color-text']).toBe('#3d3d3d');
    expect(resolver.dark).toEqual({});
    expect(resolver.variables).toEqual({});
  });
});
