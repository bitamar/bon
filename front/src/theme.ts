import { type MantineProviderProps, type MantineThemeOverride } from '@mantine/core';

export const mantineThemeOverride: MantineThemeOverride = {
  primaryColor: 'lime',
  primaryShade: 9,
  defaultRadius: 'lg',
  fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
  headings: {
    fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
    fontWeight: '600',
  },
  other: { lightAppBackground: '#fffbf5' },
};

export const lightModeCssVariablesResolver: NonNullable<
  MantineProviderProps['cssVariablesResolver']
> = () => ({
  variables: {},
  light: {
    '--mantine-color-body': '#fffbf5',
    '--mantine-color-text': '#2d2820',
  },
  dark: {
    '--mantine-color-body': '#1c1610',
  },
});
