import { Group, Text } from '@mantine/core';

export function TotalRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <Group justify="space-between">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text size="sm">{value}</Text>
    </Group>
  );
}
