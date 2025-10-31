import { type MantineProviderProps, type MantineThemeOverride } from '@mantine/core';

export const mantineThemeOverride: MantineThemeOverride = {
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
