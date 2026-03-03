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
} from '@tabler/icons-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { useBusiness } from './contexts/BusinessContext';
import classes from './Navbar.module.css';

const navLinkClass = classes['navLink'] ?? '';

export default function Navbar() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const { activeBusiness } = useBusiness();

  const bizPrefix = activeBusiness ? `/businesses/${activeBusiness.id}` : '';

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
          to={activeBusiness ? `${bizPrefix}/dashboard` : '/'}
          label="ראשי"
          leftSection={<IconHome2 size={18} />}
          active={pathname.includes('/dashboard')}
          className={navLinkClass}
        />
        <NavLink
          component={Link}
          to="/businesses"
          label="עסקים"
          leftSection={<IconBuilding size={18} />}
          active={pathname === '/businesses' || pathname === '/onboarding'}
          className={navLinkClass}
        />
        <NavLink
          component={Link}
          to={activeBusiness ? `${bizPrefix}/customers` : '/'}
          label="לקוחות"
          leftSection={<IconAddressBook size={18} />}
          active={pathname.includes('/customers')}
          className={navLinkClass}
        />
        <NavLink
          component={Link}
          to={activeBusiness ? `${bizPrefix}/invoices` : '/'}
          label="חשבוניות"
          leftSection={<IconFileInvoice size={18} />}
          active={pathname.includes('/invoices')}
          className={navLinkClass}
        />
        {activeBusiness?.role === 'owner' && (
          <NavLink
            component={Link}
            to="/settings"
            label="הגדרות"
            leftSection={<IconSettings size={18} />}
            active={pathname.startsWith('/settings')}
            className={navLinkClass}
          />
        )}
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
