import { Button, Card, Loader, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconAlertCircle, IconInbox, IconSearch } from '@tabler/icons-react';
import type { ReactNode } from 'react';

type StatusVariant = 'loading' | 'empty' | 'error' | 'notFound';

interface StatusCardProps {
  status: StatusVariant;
  title: string;
  description?: string;
  primaryAction?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: ReactNode;
  align?: 'center' | 'start';
}

const ICONS: Record<Exclude<StatusVariant, 'loading'>, typeof IconInbox> = {
  empty: IconInbox,
  error: IconAlertCircle,
  notFound: IconSearch,
};

const COLORS: Record<Exclude<StatusVariant, 'loading'>, string> = {
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
}: StatusCardProps) {
  const stackAlign = align === 'start' ? 'flex-start' : 'center';
  const textAlign = align === 'start' ? 'left' : 'center';

  return (
    <Card withBorder padding="xl">
      <Stack gap="sm" align={stackAlign} miw={align === 'center' ? 260 : undefined} mx="auto">
        {status === 'loading' ? (
          <>
            <Loader size="sm" />
            <Text c="dimmed" ta={textAlign}>
              {title}
            </Text>
            {description && (
              <Text c="dimmed" size="sm" ta={textAlign}>
                {description}
              </Text>
            )}
          </>
        ) : (
          <>
            <ThemeIcon size={44} radius="xl" variant="light" color={COLORS[status]}>
              {(() => {
                const IconComponent = ICONS[status];
                return <IconComponent size={24} />;
              })()}
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
              <Button onClick={primaryAction.onClick}>{primaryAction.label}</Button>
            )}
            {secondaryAction}
          </>
        )}
      </Stack>
    </Card>
  );
}
