import { Stack, Text, Title } from '@mantine/core';

export function BrandLogo({ subtitle }: Readonly<{ subtitle?: string }>) {
  return (
    <Stack align="center" gap={6}>
      <Title
        order={1}
        style={{ fontSize: '4rem', letterSpacing: '-0.04em', fontWeight: 1000 }}
        c="lime.9"
      >
        bon
      </Title>
      {subtitle && (
        <Text size="lg" c="dimmed" fw={400}>
          {subtitle}
        </Text>
      )}
    </Stack>
  );
}
