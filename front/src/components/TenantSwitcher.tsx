import { Button, Divider, Menu } from '@mantine/core';
import { IconBuilding, IconCheck, IconChevronDown } from '@tabler/icons-react';
import { useBusiness } from '../contexts/BusinessContext';
import { Link } from 'react-router-dom';

export function TenantSwitcher() {
  const { activeBusiness, businesses, switchBusiness } = useBusiness();

  if (!activeBusiness) {
    return (
      <Button component={Link} to="/onboarding" variant="subtle" size="sm">
        צור עסק
      </Button>
    );
  }

  return (
    <Menu shadow="md" width={220}>
      <Menu.Target>
        <Button
          variant="subtle"
          size="sm"
          leftSection={<IconBuilding size={16} />}
          rightSection={<IconChevronDown size={16} />}
        >
          {activeBusiness.name}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {businesses.map((business) => (
          <Menu.Item
            key={business.id}
            onClick={() => switchBusiness(business.id)}
            rightSection={activeBusiness.id === business.id ? <IconCheck size={16} /> : undefined}
          >
            {business.name}
          </Menu.Item>
        ))}
        <Divider my="xs" />
        <Menu.Item component={Link} to="/businesses" leftSection={<IconBuilding size={16} />}>
          נהל עסקים
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
