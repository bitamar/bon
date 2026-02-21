import { useState } from 'react';
import {
  Badge,
  Button,
  Container,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconSearch, IconUserPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { PageTitle } from '../components/PageTitle';
import { StatusCard } from '../components/StatusCard';
import { fetchCustomers } from '../api/customers';
import { queryKeys } from '../lib/queryKeys';
import { useBusiness } from '../contexts/BusinessContext';
import { extractErrorMessage } from '../lib/notifications';
import type { TaxIdType } from '@bon/types/customers';

function formatTaxId(taxId: string | null, taxIdType: TaxIdType): string {
  if (!taxId) return 'ללא מספר מזהה';
  if (taxIdType === 'company_id' && taxId.length === 9) {
    return `${taxId.slice(0, 2)}-${taxId.slice(2)}`;
  }
  return taxId;
}

export function CustomerList() {
  const navigate = useNavigate();
  const { activeBusiness } = useBusiness();
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 150);
  const [activeFilter, setActiveFilter] = useState<'false' | undefined>(undefined);

  const businessId = activeBusiness?.id ?? '';

  const customersQuery = useQuery({
    queryKey: [
      ...queryKeys.customers(businessId),
      { q: debouncedSearch || undefined, active: activeFilter },
    ],
    queryFn: () => fetchCustomers(businessId, debouncedSearch || undefined, activeFilter, 200),
    enabled: !!activeBusiness,
  });

  if (!activeBusiness) {
    return (
      <Container size="lg" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <StatusCard status="error" title="לא נבחר עסק" description="אנא בחר עסק מהתפריט העליון" />
      </Container>
    );
  }

  if (customersQuery.isPending) {
    return (
      <Container size="lg" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <StatusCard status="loading" title="טוען לקוחות..." />
      </Container>
    );
  }

  if (customersQuery.error) {
    const message = extractErrorMessage(customersQuery.error, 'לא הצלחנו לטעון את רשימת הלקוחות');
    return (
      <Container size="lg" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <StatusCard
          status="error"
          title="לא הצלחנו לטעון את רשימת הלקוחות"
          description={message}
          primaryAction={{
            label: 'נסה שוב',
            onClick: () => customersQuery.refetch(),
            loading: customersQuery.isFetching,
          }}
        />
      </Container>
    );
  }

  const customers = customersQuery.data.customers;
  const hasSearchQuery = debouncedSearch.length > 0;

  return (
    <Container size="lg" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
      <Stack gap="md">
        <Group justify="space-between">
          <PageTitle order={3}>לקוחות</PageTitle>
          <Button
            leftSection={<IconUserPlus size={18} />}
            onClick={() => navigate('/business/customers/new')}
          >
            לקוח חדש
          </Button>
        </Group>

        <Group justify="space-between">
          <TextInput
            leftSection={<IconSearch size={16} />}
            placeholder="חיפוש לפי שם או מספר מזהה..."
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <SegmentedControl
            data={[
              { value: 'active', label: 'פעילים' },
              { value: 'all', label: 'הכל' },
            ]}
            value={activeFilter === 'false' ? 'all' : 'active'}
            onChange={(value) => setActiveFilter(value === 'all' ? 'false' : undefined)}
          />
        </Group>

        {customers.length === 0 ? (
          hasSearchQuery ? (
            <StatusCard
              status="notFound"
              title="לא נמצאו לקוחות"
              description="נסו לחפש במילות מפתח אחרות"
            />
          ) : (
            <StatusCard
              status="empty"
              title="עדיין אין לקוחות"
              description="הוסיפו לקוח ראשון כדי להתחיל ליצור חשבוניות"
              primaryAction={{
                label: 'הוסף לקוח ראשון',
                onClick: () => navigate('/business/customers/new'),
              }}
            />
          )
        ) : (
          <Stack gap="xs">
            {customers.map((customer) => (
              <UnstyledButton
                key={customer.id}
                component={Link}
                to={`/business/customers/${customer.id}`}
                style={customer.isActive ? undefined : { opacity: 0.5 }}
              >
                <Paper withBorder radius="md" p="md">
                  <Group justify="space-between" wrap="nowrap">
                    <Stack gap={2}>
                      <Text fw={600}>{customer.name}</Text>
                      <Group gap="xs">
                        <Text size="sm" c="dimmed">
                          {formatTaxId(customer.taxId, customer.taxIdType)}
                        </Text>
                        {customer.city ? (
                          <Text size="sm" c="dimmed">
                            {customer.city}
                          </Text>
                        ) : null}
                      </Group>
                    </Stack>
                    <Group gap="xs">
                      {customer.isLicensedDealer ? (
                        <Badge color="blue" variant="light">
                          עוסק מורשה
                        </Badge>
                      ) : null}
                      {!customer.isActive ? (
                        <Badge color="gray" variant="light">
                          לא פעיל
                        </Badge>
                      ) : null}
                    </Group>
                  </Group>
                </Paper>
              </UnstyledButton>
            ))}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
