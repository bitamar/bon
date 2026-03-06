import { Button, Card, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconAlertCircle, IconInbox, IconSearch } from '@tabler/icons-react';
import type { ReactNode } from 'react';

type StatusVariant = 'empty' | 'error' | 'notFound';

interface StatusCardProps {
  status: StatusVariant;
  title: string;
  description?: string;
  primaryAction?: {
    label: string;
    onClick: () => void;
    loading?: boolean;
  };
  secondaryAction?: ReactNode;
  align?: 'center' | 'start';
}

const ICONS: Record<StatusVariant, typeof IconInbox> = {
  empty: IconInbox,
  error: IconAlertCircle,
  notFound: IconSearch,
};

const COLORS: Record<StatusVariant, string> = {
  empty: 'gray',
  error: 'red',
  notFound: 'yellow',
};

export function StatusCard({
  status,
  title,
  description,
  primaryAction,
  secondaryAction,
  align = 'center',
}: Readonly<StatusCardProps>) {
  const stackAlign = align === 'start' ? 'flex-start' : 'center';
  const textAlign = align === 'start' ? 'left' : 'center';

  const IconComponent = ICONS[status];

  return (
    <Card withBorder padding="xl">
      <Stack gap="sm" align={stackAlign} miw={align === 'center' ? 260 : undefined} mx="auto">
        <ThemeIcon size={44} radius="xl" variant="light" color={COLORS[status]}>
          <IconComponent size={24} />
        </ThemeIcon>
        <Text fw={600} ta={textAlign}>
          {title}
        </Text>
        {description && (
          <Text c="dimmed" ta={textAlign}>
            {description}
          </Text>
        )}
        {primaryAction && (
          <Button onClick={primaryAction.onClick} loading={primaryAction.loading === true}>
            {primaryAction.label}
          </Button>
        )}
        {secondaryAction}
      </Stack>
    </Card>
  );
}
