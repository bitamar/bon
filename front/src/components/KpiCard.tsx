import { Card, Group, Skeleton, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconArrowDownRight, IconArrowUpRight } from '@tabler/icons-react';
import type { ReactNode } from 'react';

export function KpiCard({
  label,
  value,
  trend,
  trendLabel,
  icon,
  isLoading,
}: Readonly<{
  label: string;
  value: string;
  trend: number;
  trendLabel: string;
  icon: ReactNode;
  isLoading?: boolean;
}>) {
  if (isLoading) {
    return (
      <Card withBorder radius="lg" p="lg">
        <Stack gap="sm">
          <Skeleton height={16} width="60%" />
          <Skeleton height={32} width="40%" />
          <Skeleton height={14} width="80%" />
        </Stack>
      </Card>
    );
  }

  const isPositive = trend >= 0;

  return (
    <Card withBorder radius="lg" p="lg">
      <Group justify="space-between" mb="xs">
        <Text size="sm" c="dimmed" fw={500}>
          {label}
        </Text>
        <ThemeIcon variant="light" size="lg" radius="md">
          {icon}
        </ThemeIcon>
      </Group>
      <Text fw={700} fz={28} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Text>
      <Group gap={4} mt="xs">
        {isPositive ? (
          <IconArrowUpRight size={16} color="var(--mantine-color-brand-6)" />
        ) : (
          <IconArrowDownRight size={16} color="var(--mantine-color-red-6)" />
        )}
        <Text size="xs" c={isPositive ? 'brand.6' : 'red.6'} fw={500}>
          {Math.abs(trend).toFixed(1)}%
        </Text>
        <Text size="xs" c="dimmed">
          {trendLabel}
        </Text>
      </Group>
    </Card>
  );
}
