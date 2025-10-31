import { AppShell, NavLink, ScrollArea } from '@mantine/core';
import { IconHome2, IconSettings } from '@tabler/icons-react';
import { Link, useLocation } from 'react-router-dom';

export default function Navbar() {
  const { pathname } = useLocation();
  return (
    <AppShell.Navbar p="md">
      <ScrollArea type="auto" style={{ height: '100%' }}>
        <NavLink
          component={Link}
          to="/"
          label="Dashboard"
          leftSection={<IconHome2 size={18} />}
          active={pathname === '/'}
        />
        <NavLink
          component={Link}
          to="/settings"
          label="Settings"
          leftSection={<IconSettings size={18} />}
          active={pathname.startsWith('/settings')}
        />
      </ScrollArea>
    </AppShell.Navbar>
  );
}
