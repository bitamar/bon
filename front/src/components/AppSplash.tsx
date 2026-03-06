import { Center, Text } from '@mantine/core';

/**
 * Branded splash screen shown during app boot (auth hydration, business loading).
 * Replaces the raw centered spinner with a subtle branded fade-in.
 */
export function AppSplash({ label }: Readonly<{ label?: string }>) {
  return (
    <Center h="100vh">
      <Text
        size="xl"
        fw={700}
        c="dimmed"
        className="fadeInUp"
        aria-label={label ?? 'Loading'}
        role="status"
      >
        bon
      </Text>
    </Center>
  );
}
