import { AppShell, NavLink, ScrollArea } from '@mantine/core';
import { IconBuilding, IconHome2, IconSettings, IconUsers } from '@tabler/icons-react';
import { Link, useLocation } from 'react-router-dom';

export default function Navbar() {
  const { pathname } = useLocation();
  return (
    <AppShell.Navbar p="md">
      <ScrollArea type="auto" style={{ height: '100%' }}>
        <NavLink
          component={Link}
          to="/"
          label="ראשי"
          leftSection={<IconHome2 size={18} />}
          active={pathname === '/'}
        />
        <NavLink
          component={Link}
          to="/businesses"
          label="עסקים"
          leftSection={<IconBuilding size={18} />}
          active={pathname.startsWith('/businesses') || pathname === '/onboarding'}
        />
        <NavLink
          component={Link}
          to="/business/team"
          label="צוות"
          leftSection={<IconUsers size={18} />}
          active={pathname.startsWith('/business/team')}
        />
        <NavLink
          component={Link}
          to="/settings"
          label="הגדרות"
          leftSection={<IconSettings size={18} />}
          active={pathname.startsWith('/settings')}
        />
      </ScrollArea>
    </AppShell.Navbar>
  );
}
