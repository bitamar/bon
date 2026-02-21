import { Burger, Group, Text } from '@mantine/core';

export default function Header({
  opened,
  toggle,
}: Readonly<{
  opened: boolean;
  toggle: () => void;
}>) {
  return (
    <Group h="100%" px="md">
      <Burger opened={opened} onClick={toggle} size="sm" />
      <Text fw={700} fz="lg">
        bon
      </Text>
    </Group>
  );
}
