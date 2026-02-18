import { useEffect } from 'react';
import {
  Button,
  Container,
  Divider,
  Group,
  NumberInput,
  Paper,
  Stack,
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
import type { UpdateBusinessBody } from '@bon/types/businesses';

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
      streetAddress: (value) => (value?.trim() ? null : 'כתובת רחוב נדרשת'),
      city: (value) => (value?.trim() ? null : 'עיר נדרשת'),
      postalCode: (value) => {
        if (value && !/^\d{7}$/.test(value)) return 'מיקוד חייב להיות 7 ספרות';
        return null;
      },
      phone: (value) => {
        if (value && !/^0[2-9]\d{7,8}$/.test(value)) return 'מספר טלפון לא תקין';
        return null;
      },
      email: (value) => {
        if (value && !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(value)) return 'כתובת אימייל לא תקינה';
        return null;
      },
    },
  });

  useEffect(() => {
    if (businessQuery.data) {
      const { business } = businessQuery.data;
      form.setValues({
        name: business.name ?? '',
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
    errorToast: { fallbackMessage: 'שגיאה בשמירת השינויים' },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.userBusinesses() });
      queryClient.invalidateQueries({ queryKey: queryKeys.business(activeBusiness!.id) });
      navigate('/businesses');
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
    const message = extractErrorMessage(businessQuery.error, 'שגיאה בטעינת נתוני העסק');
    return (
      <Container size="sm" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <StatusCard
          status="error"
          title="שגיאה בטעינת נתוני העסק"
          description={message}
          primaryAction={{
            label: 'נסה שוב',
            onClick: () => businessQuery.refetch(),
          }}
        />
      </Container>
    );
  }

  const onSubmit = form.onSubmit((values) => {
    const { registrationNumber: _, ...updateData } = values;
    updateMutation.mutate({ id: activeBusiness.id, data: updateData });
  });

  return (
    <Container size="sm" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
      <Stack gap="md">
        <PageTitle order={3}>הגדרות עסק</PageTitle>
        <Paper component="form" onSubmit={onSubmit} withBorder radius="lg" p="lg">
          <Stack gap="md">
            <TextInput label="שם העסק" required {...form.getInputProps('name')} />

            <TextInput label="מספר רישום" disabled {...form.getInputProps('registrationNumber')} />

            <Divider label="כתובת" labelPosition="center" />

            <TextInput label="רחוב" required {...form.getInputProps('streetAddress')} />

            <Group grow>
              <TextInput label="עיר" required {...form.getInputProps('city')} />
              <TextInput
                label="מיקוד"
                placeholder="7 ספרות"
                {...form.getInputProps('postalCode')}
              />
            </Group>

            <Divider label="פרטי קשר" labelPosition="center" />

            <TextInput label="טלפון" placeholder="05XXXXXXXX" {...form.getInputProps('phone')} />

            <TextInput label="אימייל" type="email" {...form.getInputProps('email')} />

            <Divider label="הגדרות חשבוניות" labelPosition="center" />

            <TextInput label="קידומת מספר חשבונית" {...form.getInputProps('invoiceNumberPrefix')} />

            <NumberInput
              label='אחוז מע"ם (בסיס נקודות - 1700 = 17%)'
              min={0}
              max={10000}
              {...form.getInputProps('defaultVatRate')}
            />

            <Group justify="space-between">
              <Button variant="subtle" onClick={() => navigate('/businesses')}>
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
