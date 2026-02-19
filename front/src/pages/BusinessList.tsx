import { Badge, Button, Card, Container, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconBuilding, IconPlus } from '@tabler/icons-react';
import { PageTitle } from '../components/PageTitle';
import { StatusCard } from '../components/StatusCard';
import { useBusiness } from '../contexts/BusinessContext';
import { useNavigate } from 'react-router-dom';
import type { BusinessListItem } from '@bon/types/businesses';

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  licensed_dealer: 'עוסק מורשה',
  exempt_dealer: 'עוסק פטור',
  limited_company: 'חברה בע"מ',
};

const ROLE_COLORS: Record<string, string> = {
  owner: 'violet',
  admin: 'blue',
  user: 'gray',
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'בעלים',
  admin: 'מנהל',
  user: 'משתמש',
};

function BusinessCard({
  business,
  isActive,
  onSwitch,
  onEdit,
}: Readonly<{
  business: BusinessListItem;
  isActive: boolean;
  onSwitch: () => void;
  onEdit: () => void;
}>) {
  const canEdit = business.role === 'owner' || business.role === 'admin';

  return (
    <Card
      withBorder
      radius="lg"
      p="lg"
      style={{
        borderColor: isActive ? 'var(--mantine-color-blue-5)' : undefined,
        borderWidth: isActive ? 2 : 1,
      }}
    >
      <Stack gap="md">
        <Group justify="space-between">
          <Group gap="xs">
            <IconBuilding size={20} />
            <Text fw={600}>{business.name}</Text>
          </Group>
          <Badge color={ROLE_COLORS[business.role] as string}>{ROLE_LABELS[business.role]}</Badge>
        </Group>

        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            {BUSINESS_TYPE_LABELS[business.businessType]}
          </Text>
          <Text size="sm" c="dimmed">
            מספר רישום: {business.registrationNumber}
          </Text>
        </Stack>

        <Group justify="space-between">
          {isActive ? (
            <Badge color="green" variant="light">
              עסק פעיל
            </Badge>
          ) : (
            <Button size="xs" variant="light" onClick={onSwitch}>
              החלף
            </Button>
          )}
          {canEdit && (
            <Button size="xs" variant="subtle" onClick={onEdit}>
              ערוך
            </Button>
          )}
        </Group>
      </Stack>
    </Card>
  );
}

export function BusinessList() {
  const { activeBusiness, businesses, switchBusiness, isLoading } = useBusiness();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Container size="lg" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <StatusCard status="loading" title="טוען עסקים..." />
      </Container>
    );
  }

  if (businesses.length === 0) {
    return (
      <Container size="lg" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <StatusCard
          status="empty"
          title="אין עסקים"
          description="צור את העסק הראשון שלך כדי להתחיל"
          primaryAction={{
            label: 'צור עסק',
            onClick: () => navigate('/onboarding'),
          }}
        />
      </Container>
    );
  }

  return (
    <Container size="lg" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
      <Stack gap="md">
        <Group justify="space-between">
          <PageTitle order={3}>העסקים שלי</PageTitle>
          <Button leftSection={<IconPlus size={18} />} onClick={() => navigate('/onboarding')}>
            צור עסק חדש
          </Button>
        </Group>

        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {businesses.map((business) => (
            <BusinessCard
              key={business.id}
              business={business}
              isActive={activeBusiness?.id === business.id}
              onSwitch={() => switchBusiness(business.id)}
              onEdit={() => {
                switchBusiness(business.id);
                navigate('/business/settings');
              }}
            />
          ))}
        </SimpleGrid>
      </Stack>
    </Container>
  );
}
