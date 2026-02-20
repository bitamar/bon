import { type MantineProviderProps, type MantineThemeOverride } from '@mantine/core';

export const mantineThemeOverride: MantineThemeOverride = {
  primaryColor: 'teal',
  defaultRadius: 'md',
  fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
  headings: {
    fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
    fontWeight: '600',
  },
  other: { lightAppBackground: '#f0fafa' },
};

export const lightModeCssVariablesResolver: NonNullable<
  MantineProviderProps['cssVariablesResolver']
> = () => ({
  variables: {},
  light: {
    '--mantine-color-text': '#3d3d3d',
  },
  dark: {},
});
