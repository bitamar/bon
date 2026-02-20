import {
  type MantineColorsTuple,
  type MantineProviderProps,
  type MantineThemeOverride,
} from '@mantine/core';

const sage: MantineColorsTuple = [
  '#f2f9f5',
  '#e0efe5',
  '#c2ddc9',
  '#9fc9a8',
  '#7ab489',
  '#5a9e6b',
  '#4A7C59',
  '#3d6649',
  '#2f5039',
  '#1f3826',
];

const warmDark: MantineColorsTuple = [
  '#f5ede0',
  '#e8dcc8',
  '#c8b896',
  '#a89468',
  '#8a7447',
  '#6e582e',
  '#4a3c22',
  '#352a14',
  '#261f0e',
  '#1c1610',
];

export const mantineThemeOverride: MantineThemeOverride = {
  primaryColor: 'sage',
  defaultRadius: 'lg',
  fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
  headings: {
    fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
    fontWeight: '600',
  },
  colors: {
    sage,
    dark: warmDark,
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
