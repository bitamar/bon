import { Group, Text } from '@mantine/core';
import { IconCheck, IconLoader2, IconPointFilled } from '@tabler/icons-react';

type SaveStatus = 'saved' | 'saving' | 'unsaved';

const CONFIG: Record<SaveStatus, { label: string; color: string; Icon: typeof IconCheck }> = {
  saved: { label: 'נשמר', color: 'green', Icon: IconCheck },
  saving: { label: 'שומר...', color: 'blue', Icon: IconLoader2 },
  unsaved: { label: 'שינויים שלא נשמרו', color: 'yellow', Icon: IconPointFilled },
};

export function SaveIndicator({ status }: Readonly<{ status: SaveStatus }>) {
  const { label, color, Icon } = CONFIG[status];

  return (
    <Group gap={4} align="center">
      <Icon
        size={14}
        color={`var(--mantine-color-${color}-6)`}
        {...(status === 'saving' ? { className: 'mantine-rotate' } : {})}
      />
      <Text size="xs" c={`${color}.6`}>
        {label}
      </Text>
    </Group>
  );
}

export type { SaveStatus };
