import { Card, Group, Skeleton, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconArrowDownRight, IconArrowUpRight } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function KpiCard({
  label,
  value,
  trend,
  trendLabel,
  icon,
  isLoading,
  href,
  color,
}: Readonly<{
  label: string;
  value: string;
  trend?: number;
  trendLabel?: string;
  icon: ReactNode;
  isLoading?: boolean;
  href?: string;
  color?: string;
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

  const showTrendArrows = trend !== 0;
  const isPositive = (trend ?? 0) >= 0;

  const card = (
    <Card withBorder radius="lg" p="lg" style={href ? { cursor: 'pointer' } : undefined}>
      <Group justify="space-between" mb="xs">
        <Text size="sm" c="dimmed" fw={500}>
          {label}
        </Text>
        <ThemeIcon variant="light" size="lg" radius="md" {...(color ? { color } : {})}>
          {icon}
        </ThemeIcon>
      </Group>
      <Text
        fw={700}
        fz={28}
        {...(color ? { c: color } : {})}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </Text>
      <Group gap={4} mt="xs">
        {showTrendArrows &&
          (isPositive ? (
            <IconArrowUpRight size={16} color="var(--mantine-color-brand-6)" />
          ) : (
            <IconArrowDownRight size={16} color="var(--mantine-color-red-6)" />
          ))}
        {showTrendArrows && (
          <Text size="xs" c={isPositive ? 'brand.6' : 'red.6'} fw={500}>
            {Math.abs(trend ?? 0).toFixed(1)}%
          </Text>
        )}
        <Text size="xs" c="dimmed">
          {trendLabel}
        </Text>
      </Group>
    </Card>
  );

  if (href) {
    return (
      <Link to={href} style={{ textDecoration: 'none', color: 'inherit' }}>
        {card}
      </Link>
    );
  }

  return card;
}
