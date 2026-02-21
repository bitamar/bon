import { createTheme, type MantineProviderProps } from '@mantine/core';
import { brandColors } from './colors';

export const bonTheme = createTheme({
  primaryColor: 'brand',
  primaryShade: 6,
  colors: {
    brand: brandColors,
  },
  defaultRadius: 'md',
  fontFamily: "'Rubik', -apple-system, BlinkMacSystemFont, sans-serif",
  headings: {
    fontFamily: "'Rubik', -apple-system, BlinkMacSystemFont, sans-serif",
    fontWeight: '700',
  },
  shadows: {
    xs: '0 1px 2px rgba(0, 0, 0, 0.04)',
    sm: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
    md: '0 4px 6px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(0, 0, 0, 0.04)',
    lg: '0 10px 15px rgba(0, 0, 0, 0.06), 0 4px 6px rgba(0, 0, 0, 0.04)',
    xl: '0 20px 25px rgba(0, 0, 0, 0.08), 0 8px 10px rgba(0, 0, 0, 0.04)',
  },
  components: {
    Card: {
      defaultProps: {
        shadow: 'sm',
        radius: 'md',
        padding: 'lg',
        withBorder: true,
      },
    },
    Button: {
      defaultProps: {
        radius: 'md',
      },
    },
    Badge: {
      defaultProps: {
        radius: 'sm',
        variant: 'light',
      },
    },
    Paper: {
      defaultProps: {
        radius: 'md',
        shadow: 'sm',
      },
    },
  },
});

export const cssVariablesResolver: NonNullable<
  MantineProviderProps['cssVariablesResolver']
> = () => ({
  variables: {},
  light: {
    '--mantine-color-body': '#f8f9fb',
    '--mantine-color-text': '#1a2332',
  },
  dark: {
    '--mantine-color-body': '#1c1610',
  },
});
