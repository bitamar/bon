import {
  AppShell,
  Avatar,
  Box,
  Group,
  NavLink,
  ScrollArea,
  Text,
  UnstyledButton,
} from '@mantine/core';
import {
  IconAddressBook,
  IconBuilding,
  IconFileInvoice,
  IconHome2,
  IconLogout,
  IconSettings,
  IconUsers,
} from '@tabler/icons-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { useBusiness } from './contexts/BusinessContext';
import classes from './Navbar.module.css';

const navLinkClass = classes['navLink'] ?? '';
const disabledClass = `${navLinkClass} ${classes['disabledLink'] ?? ''}`;

export default function Navbar() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const { activeBusiness } = useBusiness();

  return (
    <AppShell.Navbar className={classes['navbar'] ?? ''}>
      <Box className={classes['logoArea'] ?? ''}>
        <Text
          fw={900}
          fz={24}
          c="#fff"
          style={{ letterSpacing: '-0.03em' }}
          className={classes['logoText'] ?? ''}
        >
          bon
        </Text>
      </Box>

      <ScrollArea type="auto" style={{ flex: 1 }} px="xs">
        <NavLink
          component={Link}
          to="/"
          label="ראשי"
          leftSection={<IconHome2 size={18} />}
          active={pathname === '/'}
          className={navLinkClass}
        />
        <NavLink
          component={Link}
          to="/businesses"
          label="עסקים"
          leftSection={<IconBuilding size={18} />}
          active={pathname.startsWith('/businesses') || pathname === '/onboarding'}
          className={navLinkClass}
        />
        <NavLink
          component={Link}
          to="/business/customers"
          label="לקוחות"
          leftSection={<IconAddressBook size={18} />}
          active={pathname.startsWith('/business/customers')}
          className={navLinkClass}
        />
        <NavLink
          label="חשבוניות"
          leftSection={<IconFileInvoice size={18} />}
          disabled
          className={disabledClass}
        />
        <NavLink
          component={Link}
          to="/business/team"
          label="צוות"
          leftSection={<IconUsers size={18} />}
          active={pathname.startsWith('/business/team')}
          className={navLinkClass}
        />
        <NavLink
          component={Link}
          to="/settings"
          label="הגדרות"
          leftSection={<IconSettings size={18} />}
          active={pathname.startsWith('/settings')}
          className={navLinkClass}
        />
      </ScrollArea>

      <Box className={classes['userSection'] ?? ''}>
        <Group gap="sm" wrap="nowrap">
          <Avatar size={32} radius="xl" src={user?.avatarUrl ?? null} color="brand">
            {user?.name?.[0] ?? user?.email?.[0] ?? ''}
          </Avatar>
          <Box style={{ flex: 1, overflow: 'hidden' }}>
            <Text size="sm" fw={500} c="#fff" truncate>
              {user?.name || user?.email || ''}
            </Text>
            {activeBusiness ? (
              <Text size="xs" c="rgba(255, 255, 255, 0.5)" truncate>
                {activeBusiness.name}
              </Text>
            ) : null}
          </Box>
          <UnstyledButton
            onClick={logout}
            title="התנתקות"
            className={classes['logoutButton'] ?? ''}
          >
            <IconLogout size={18} />
          </UnstyledButton>
        </Group>
      </Box>
    </AppShell.Navbar>
  );
}
