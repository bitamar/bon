import { useEffect } from 'react';
import {
  Button,
  Container,
  Divider,
  Group,
  NumberInput,
  Paper,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { PageTitle } from '../components/PageTitle';
import { StatusCard } from '../components/StatusCard';
import { useApiMutation } from '../lib/useApiMutation';
import { fetchBusiness, updateBusiness } from '../api/businesses';
import { useNavigate } from 'react-router-dom';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import { useBusiness } from '../contexts/BusinessContext';
import { extractErrorMessage } from '../lib/notifications';
import { AddressAutocomplete } from '../components/AddressAutocomplete';
import type { UpdateBusinessBody, BusinessType } from '@bon/types/businesses';

function getVatLabel(businessType: BusinessType): string {
  switch (businessType) {
    case 'licensed_dealer':
      return 'מספר רישום מע״מ';
    case 'limited_company':
      return 'מספר מע"מ';
    case 'exempt_dealer':
      return '';
  }
}

function getVatDescription(businessType: BusinessType): string {
  switch (businessType) {
    case 'licensed_dealer':
      return 'בדרך כלל זהה למספר הרישום';
    case 'limited_company':
      return 'בדרך כלל זהה לח.פ.';
    case 'exempt_dealer':
      return '';
  }
}

function businessTypeLabel(type: string): string {
  switch (type) {
    case 'licensed_dealer':
      return 'עוסק מורשה';
    case 'exempt_dealer':
      return 'עוסק פטור';
    case 'limited_company':
      return 'חברה בע״מ';
    default:
      return type;
  }
}

export function BusinessSettings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeBusiness } = useBusiness();

  const businessQuery = useQuery({
    queryKey: queryKeys.business(activeBusiness?.id ?? ''),
    queryFn: () => fetchBusiness(activeBusiness!.id),
    enabled: !!activeBusiness,
  });

  const form = useForm<UpdateBusinessBody & { registrationNumber: string }>({
    initialValues: {
      name: '',
      vatNumber: undefined,
      streetAddress: '',
      city: '',
      postalCode: undefined,
      phone: undefined,
      email: undefined,
      invoiceNumberPrefix: undefined,
      defaultVatRate: 1700,
      registrationNumber: '',
    },
    validate: {
      name: (value) => (value?.trim() ? null : 'שם העסק נדרש'),
      vatNumber: (value) => {
        if (!value) return null;
        if (!/^\d{9}$/.test(value)) return 'מספר רישום חייב להיות 9 ספרות';
        return null;
      },
      streetAddress: () => null,
      city: () => null,
      postalCode: (value) => {
        if (value && !/^\d{7}$/.test(value)) return 'מיקוד חייב להיות 7 ספרות';
        return null;
      },
      phone: (value) => {
        if (value && !/^0[2-9]\d{7,8}$/.test(value)) return 'מספר טלפון לא תקין';
        return null;
      },
      email: (value) => {
        if (value && !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(value))
          return 'כתובת אימייל לא תקינה';
        return null;
      },
    },
  });

  useEffect(() => {
    if (businessQuery.data) {
      const { business } = businessQuery.data;
      form.setValues({
        name: business.name ?? '',
        vatNumber: business.vatNumber ?? undefined,
        streetAddress: business.streetAddress ?? '',
        city: business.city ?? '',
        postalCode: business.postalCode ?? undefined,
        phone: business.phone ?? undefined,
        email: business.email ?? undefined,
        invoiceNumberPrefix: business.invoiceNumberPrefix ?? undefined,
        defaultVatRate: business.defaultVatRate,
        registrationNumber: business.registrationNumber,
      });
    }
  }, [businessQuery.data]); // form excluded intentionally - setValues causes re-render

  const updateMutation = useApiMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBusinessBody }) =>
      updateBusiness(id, data),
    successToast: { message: 'השינויים נשמרו בהצלחה' },
    errorToast: { fallbackMessage: 'לא הצלחנו לשמור את השינויים, נסו שוב' },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.userBusinesses() });
      queryClient.invalidateQueries({ queryKey: queryKeys.business(activeBusiness!.id) });
    },
  });

  if (!activeBusiness) {
    return (
      <Container size="sm" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <StatusCard status="error" title="לא נבחר עסק" description="אנא בחר עסק מהתפריט העליון" />
      </Container>
    );
  }

  if (businessQuery.isPending) {
    return (
      <Container size="sm" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <StatusCard status="loading" title="טוען נתוני עסק..." />
      </Container>
    );
  }

  if (businessQuery.error) {
    const message = extractErrorMessage(businessQuery.error, 'לא הצלחנו לטעון את נתוני העסק');
    return (
      <Container size="sm" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <StatusCard
          status="error"
          title="לא הצלחנו לטעון את נתוני העסק"
          description={message}
          primaryAction={{
            label: 'נסה שוב',
            onClick: () => businessQuery.refetch(),
            loading: businessQuery.isFetching,
          }}
        />
      </Container>
    );
  }

  const onSubmit = form.onSubmit((values) => {
    const { registrationNumber: _, ...updateData } = values;
    updateMutation.mutate({ id: activeBusiness.id, data: updateData });
  });

  const initialCity = businessQuery.data?.business.city ?? '';
  const initialStreetAddress = businessQuery.data?.business.streetAddress ?? '';

  return (
    <Container size="sm" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
      <Stack gap="md">
        <PageTitle order={3}>הגדרות עסק</PageTitle>
        <Paper component="form" onSubmit={onSubmit} withBorder radius="lg" p="lg">
          <Stack gap="md">
            <Stack gap={4}>
              <Text size="sm" fw={500}>
                סוג עסק
              </Text>
              <Text size="sm" c="dimmed">
                {businessTypeLabel(activeBusiness.businessType)}
              </Text>
            </Stack>

            <TextInput label="שם העסק" required {...form.getInputProps('name')} />

            <TextInput label="מספר רישום" disabled {...form.getInputProps('registrationNumber')} />

            {activeBusiness.businessType !== 'exempt_dealer' && (
              <TextInput
                label={getVatLabel(activeBusiness.businessType as BusinessType)}
                description={getVatDescription(activeBusiness.businessType as BusinessType)}
                placeholder="123456789"
                maxLength={9}
                {...form.getInputProps('vatNumber')}
              />
            )}

            <Divider label="כתובת" labelPosition="center" />

            <AddressAutocomplete
              key={`addr-${initialCity}`}
              form={form}
              disabled={updateMutation.isPending}
              initialCity={initialCity}
              initialStreetAddress={initialStreetAddress}
            />

            <Divider label="פרטי קשר" labelPosition="center" />

            <TextInput label="טלפון" placeholder="05XXXXXXXX" {...form.getInputProps('phone')} />

            <TextInput label="אימייל" type="email" {...form.getInputProps('email')} />

            <Divider label="הגדרות חשבוניות" labelPosition="center" />

            <TextInput label="קידומת מספר חשבונית" {...form.getInputProps('invoiceNumberPrefix')} />

            <NumberInput
              label='שיעור מע"מ'
              description='בנקודות בסיס — 1700 = 17%, 0 = פטור ממע"מ'
              min={0}
              max={10000}
              {...form.getInputProps('defaultVatRate')}
            />

            <Group justify="space-between">
              <Button variant="subtle" onClick={() => navigate(-1)}>
                ביטול
              </Button>
              <Button type="submit" loading={updateMutation.isPending}>
                שמור שינויים
              </Button>
            </Group>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
