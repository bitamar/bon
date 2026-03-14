import { useEffect } from 'react';
import { Button, Divider, Group, NumberInput, Paper, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { FormSkeleton } from '../components/FormSkeleton';
import { StatusCard } from '../components/StatusCard';
import { useApiMutation } from '../lib/useApiMutation';
import { fetchBusiness, updateBusiness } from '../api/businesses';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import { useBusiness } from '../contexts/BusinessContext';
import { extractErrorMessage } from '../lib/notifications';
import { AddressAutocomplete } from '../components/AddressAutocomplete';
import { EmergencyNumbersSection } from '../components/EmergencyNumbersSection';
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

export function BusinessSettingsSection() {
  const queryClient = useQueryClient();
  const { activeBusiness } = useBusiness();
  const businessId = activeBusiness?.id ?? '';

  const businessQuery = useQuery({
    queryKey: queryKeys.business(businessId),
    queryFn: () => fetchBusiness(businessId),
    enabled: !!businessId,
  });

  const form = useForm<UpdateBusinessBody & { registrationNumber: string }>({
    initialValues: {
      name: '',
      vatNumber: '',
      streetAddress: '',
      city: '',
      postalCode: undefined,
      phone: '',
      email: '',
      invoiceNumberPrefix: '',
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
        vatNumber: business.vatNumber ?? '',
        streetAddress: business.streetAddress ?? '',
        city: business.city ?? '',
        postalCode: business.postalCode ?? undefined,
        phone: business.phone ?? '',
        email: business.email ?? '',
        invoiceNumberPrefix: business.invoiceNumberPrefix ?? '',
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
      queryClient.invalidateQueries({ queryKey: queryKeys.business(businessId) });
    },
  });

  if (!activeBusiness) {
    return null;
  }

  if (businessQuery.isPending) {
    return <FormSkeleton rows={6} />;
  }

  if (businessQuery.error) {
    const message = extractErrorMessage(businessQuery.error, 'לא הצלחנו לטעון את נתוני העסק');
    return (
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
    );
  }

  const onSubmit = form.onSubmit((values) => {
    const { registrationNumber: _, ...rest } = values;
    updateMutation.mutate({
      id: businessId,
      data: {
        ...rest,
        vatNumber: rest.vatNumber === '' ? null : rest.vatNumber,
        phone: rest.phone === '' ? null : rest.phone,
        email: rest.email === '' ? null : rest.email,
        invoiceNumberPrefix: rest.invoiceNumberPrefix === '' ? null : rest.invoiceNumberPrefix,
      },
    });
  });

  const initialCity = businessQuery.data?.business.city ?? '';
  const initialStreetAddress = businessQuery.data?.business.streetAddress ?? '';

  return (
    <>
      <Paper component="form" onSubmit={onSubmit} noValidate withBorder radius="lg" p="lg">
        <Stack gap="md">
          <Text size="lg" fw={600}>
            הגדרות עסק
          </Text>

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

          <Group justify="flex-end">
            <Button type="submit" loading={updateMutation.isPending}>
              שמור שינויים
            </Button>
          </Group>
        </Stack>
      </Paper>

      {activeBusiness.role === 'owner' && (
        <Paper withBorder radius="lg" p="lg">
          <Stack gap="md">
            <Text size="lg" fw={600}>
              מספרי חירום שע״מ
            </Text>
            <Text size="sm" c="dimmed">
              מספרי הקצאה לשימוש כאשר מערכת שע״מ אינה זמינה. המספרים מתקבלים ישירות מרשות המסים.
            </Text>
            <EmergencyNumbersSection businessId={businessId} />
          </Stack>
        </Paper>
      )}
    </>
  );
}
