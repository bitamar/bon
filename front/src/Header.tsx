import { AppShell, Avatar, Burger, Button, Divider, Group, Menu, Title } from '@mantine/core';
import { IconChevronDown, IconLogout, IconSettings } from '@tabler/icons-react';
import { useAuth } from './auth/AuthContext';
import { Link } from 'react-router-dom';
import classes from './Header.module.css';
import { TenantSwitcher } from './components/TenantSwitcher';

export default function Header({
  opened,
  setOpened,
}: Readonly<{
  opened: boolean;
  setOpened: React.Dispatch<React.SetStateAction<boolean>>;
}>) {
  const { logout, user } = useAuth();
  return (
    <AppShell.Header>
      <Group h="100%" px="md" justify="space-between">
        <Group>
          <Burger
            opened={opened}
            onClick={() => setOpened((open: boolean) => !open)}
            hiddenFrom="sm"
            size="sm"
          />

          <Title order={6} className={classes['branding'] ?? ''}>
            bon starter
          </Title>
        </Group>

        <Group>
          <TenantSwitcher />
          <Menu shadow="md" width={220}>
            <Menu.Target>
              <Button
                variant="subtle"
                leftSection={<Avatar size={20} radius="xl" src={user?.avatarUrl ?? null} />}
                rightSection={<IconChevronDown size={16} />}
              >
                {user?.name || user?.email || ''}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item component={Link} to="/settings" leftSection={<IconSettings size={16} />}>
                הגדרות
              </Menu.Item>

              <Divider my="xs" />
              <Menu.Item leftSection={<IconLogout size={16} />} color="red" onClick={logout}>
                התנתקות
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
    </AppShell.Header>
  );
}
