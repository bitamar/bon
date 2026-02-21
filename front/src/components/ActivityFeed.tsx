import { Card, Skeleton, Stack, Text, Timeline, ThemeIcon } from '@mantine/core';
import { IconCash, IconFileInvoice, IconSend, IconUserPlus } from '@tabler/icons-react';
import type { ActivityItem } from '../hooks/useDashboardData';
import { formatCurrency, formatRelativeTime } from '../hooks/useDashboardData';

const ACTIVITY_ICONS: Record<ActivityItem['type'], { icon: typeof IconCash; color: string }> = {
  payment_received: { icon: IconCash, color: 'brand' },
  invoice_created: { icon: IconFileInvoice, color: 'blue' },
  invoice_sent: { icon: IconSend, color: 'violet' },
  customer_added: { icon: IconUserPlus, color: 'orange' },
};

export function ActivityFeed({
  items,
  isLoading,
}: Readonly<{
  items: ActivityItem[] | undefined;
  isLoading?: boolean;
}>) {
  if (isLoading) {
    return (
      <Card withBorder radius="lg" p="lg">
        <Stack gap="sm">
          <Skeleton height={18} width="30%" />
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} height={48} />
          ))}
        </Stack>
      </Card>
    );
  }

  if (!items || items.length === 0) {
    return (
      <Card withBorder radius="lg" p="lg">
        <Text fw={600} mb="md">
          פעילות אחרונה
        </Text>
        <Text c="dimmed" ta="center" py="xl">
          אין פעילות להצגה
        </Text>
      </Card>
    );
  }

  return (
    <Card withBorder radius="lg" p="lg">
      <Text fw={600} mb="md">
        פעילות אחרונה
      </Text>
      <Timeline active={items.length - 1} bulletSize={28} lineWidth={2}>
        {items.map((item) => {
          const config = ACTIVITY_ICONS[item.type];
          const Icon = config.icon;
          return (
            <Timeline.Item
              key={item.id}
              bullet={
                <ThemeIcon size={28} radius="xl" variant="light" color={config.color}>
                  <Icon size={14} />
                </ThemeIcon>
              }
            >
              <Text size="sm">{item.description}</Text>
              <Text size="xs" c="dimmed" mt={2}>
                {formatRelativeTime(item.timestamp)}
                {item.amount == null ? '' : ` \u00B7 ${formatCurrency(item.amount)}`}
              </Text>
            </Timeline.Item>
          );
        })}
      </Timeline>
    </Card>
  );
}
