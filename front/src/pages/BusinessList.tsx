import {
  Badge,
  Button,
  Card,
  Center,
  Container,
  Divider,
  Group,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
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
      shadow={isActive ? 'md' : 'sm'}
      style={{
        borderColor: isActive ? 'var(--mantine-color-brand-5)' : 'var(--mantine-color-gray-2)',
        borderWidth: isActive ? 2 : undefined,
        background: isActive
          ? 'light-dark(var(--mantine-color-brand-0), rgba(124, 58, 237, 0.08))'
          : undefined,
        cursor: 'pointer',
        transition: 'all 200ms ease',
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = 'var(--mantine-shadow-md)';
          e.currentTarget.style.borderColor = 'var(--mantine-color-gray-3)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.transform = '';
          e.currentTarget.style.boxShadow = '';
          e.currentTarget.style.borderColor = 'var(--mantine-color-gray-2)';
        }
      }}
    >
      <Group justify="space-between" align="flex-start" mb="md">
        <div>
          <Text fw={600} fz="lg" lh={1.3}>
            {business.name}
          </Text>
          <Text c="dimmed" fz="sm" mt={4}>
            {BUSINESS_TYPE_LABELS[business.businessType]}
          </Text>
        </div>
        <Badge variant="light" color="brand" size="sm">
          {ROLE_LABELS[business.role]}
        </Badge>
      </Group>

      <Text c="dimmed" fz="xs" className="tabular-nums" mb="md">
        מספר רישום: {business.registrationNumber}
      </Text>

      <Divider color="gray.2" mb="md" />

      <Group justify="space-between" align="center">
        {isActive ? (
          <Badge variant="dot" color="green" size="sm">
            עסק פעיל
          </Badge>
        ) : (
          <Button size="xs" variant="light" color="brand" radius="md" onClick={onSwitch}>
            החלף
          </Button>
        )}
        {canEdit && (
          <Button size="xs" variant="subtle" color="gray" onClick={onEdit}>
            ערוך
          </Button>
        )}
      </Group>
    </Card>
  );
}

function AddBusinessCard({ onClick }: Readonly<{ onClick: () => void }>) {
  return (
    <Card
      style={{
        borderStyle: 'dashed',
        borderColor: 'var(--mantine-color-gray-3)',
        borderWidth: 2,
        cursor: 'pointer',
        background: 'transparent',
        transition: 'all 200ms ease',
      }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick();
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--mantine-color-brand-4)';
        e.currentTarget.style.background = 'rgba(124, 58, 237, 0.03)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--mantine-color-gray-3)';
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <Center h="100%" mih={140}>
        <Stack align="center" gap="xs">
          <IconPlus size={24} color="var(--mantine-color-gray-4)" />
          <Text c="dimmed" size="sm">
            צור עסק חדש
          </Text>
        </Stack>
      </Center>
    </Card>
  );
}

export function BusinessList() {
  const { activeBusiness, businesses, switchBusiness, isLoading } = useBusiness();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Container size="lg" py="xl">
        <StatusCard status="loading" title="טוען עסקים..." />
      </Container>
    );
  }

  if (businesses.length === 0) {
    return (
      <Container size="lg" py="xl">
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
    <Container size="lg" py="xl">
      <PageTitle order={2} mb="xl">
        העסקים שלי
      </PageTitle>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
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
        <AddBusinessCard onClick={() => navigate('/onboarding')} />
      </SimpleGrid>
    </Container>
  );
}
