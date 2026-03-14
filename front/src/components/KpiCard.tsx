import { Card, Group, Skeleton, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconArrowDownRight, IconArrowUpRight } from '@tabler/icons-react';
import type { ReactNode } from 'react';

export function KpiCard({
  label,
  value,
  subtitle,
  trend,
  trendLabel,
  icon,
  accent,
  isLoading,
}: Readonly<{
  label: string;
  value: string;
  subtitle?: string;
  trend?: number;
  trendLabel?: string;
  icon: ReactNode;
  accent?: 'red';
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

  const borderColor = accent === 'red' ? 'var(--mantine-color-red-4)' : undefined;

  return (
    <Card withBorder radius="lg" p="lg" style={borderColor ? { borderColor } : undefined}>
      <Group justify="space-between" mb="xs">
        <Text size="sm" c="dimmed" fw={500}>
          {label}
        </Text>
        <ThemeIcon
          variant="light"
          size="lg"
          radius="md"
          {...(accent === 'red' ? { color: 'red' as const } : {})}
        >
          {icon}
        </ThemeIcon>
      </Group>
      <Text
        fw={700}
        fz={28}
        {...(accent ? { c: accent } : {})}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </Text>
      {subtitle ? (
        <Text size="xs" c="dimmed" mt="xs">
          {subtitle}
        </Text>
      ) : null}
      {trend != null && trendLabel ? (
        <Group gap={4} mt="xs">
          {trend >= 0 ? (
            <IconArrowUpRight size={16} color="var(--mantine-color-brand-6)" />
          ) : (
            <IconArrowDownRight size={16} color="var(--mantine-color-red-6)" />
          )}
          <Text size="xs" c={trend >= 0 ? 'brand.6' : 'red.6'} fw={500}>
            {Math.abs(trend).toFixed(1)}%
          </Text>
          <Text size="xs" c="dimmed">
            {trendLabel}
          </Text>
        </Group>
      ) : null}
    </Card>
  );
}
