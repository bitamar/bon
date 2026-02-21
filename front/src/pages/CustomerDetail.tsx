import { useRef } from 'react';
import { Button, Container, Divider, Group, Modal, Paper, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageTitle } from '../components/PageTitle';
import { StatusCard } from '../components/StatusCard';
import {
  CustomerForm,
  type CustomerFormHandle,
  type CustomerFormValues,
} from '../components/CustomerForm';
import { useApiMutation } from '../lib/useApiMutation';
import { deleteCustomer, fetchCustomer, updateCustomer } from '../api/customers';
import { queryKeys } from '../lib/queryKeys';
import { useBusiness } from '../contexts/BusinessContext';
import { handleDuplicateTaxIdError } from '../lib/duplicateTaxIdError';
import { extractErrorMessage, showErrorNotification } from '../lib/notifications';
import type { UpdateCustomerBody } from '@bon/types/customers';

function buildUpdatePayload(values: CustomerFormValues): UpdateCustomerBody {
  return {
    name: values.name,
    taxIdType: values.taxIdType === 'none' ? null : values.taxIdType,
    taxId: values.taxIdType === 'none' ? null : values.taxId || null,
    isLicensedDealer: values.isLicensedDealer,
    email: values.email || null,
    phone: values.phone || null,
    city: values.city || null,
    streetAddress: values.streetAddress || null,
    postalCode: values.postalCode || null,
    contactName: values.contactName || null,
    notes: values.notes || null,
  } as UpdateCustomerBody;
}

export function CustomerDetail() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeBusiness } = useBusiness();
  const formRef = useRef<CustomerFormHandle>(null);
  const [deleteOpened, { open: openDelete, close: closeDelete }] = useDisclosure(false);

  const businessId = activeBusiness?.id ?? '';

  const customerQuery = useQuery({
    queryKey: queryKeys.customer(businessId, customerId ?? ''),
    queryFn: () => fetchCustomer(businessId, customerId!),
    enabled: !!activeBusiness && !!customerId,
  });

  const updateMutation = useApiMutation({
    mutationFn: (data: UpdateCustomerBody) => updateCustomer(businessId, customerId!, data),
    errorToast: false,
    successToast: { message: 'הלקוח עודכן בהצלחה' },
    onError: (error) => {
      if (handleDuplicateTaxIdError(error, formRef)) return;
      showErrorNotification(extractErrorMessage(error, 'משהו לא עבד, נסו שוב'));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customer(businessId, customerId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.customers(businessId) });
    },
  });

  const deleteMutation = useApiMutation({
    mutationFn: () => deleteCustomer(businessId, customerId!),
    successToast: { message: 'הלקוח הוסר בהצלחה' },
    errorToast: { fallbackMessage: 'לא הצלחנו להסיר את הלקוח, נסו שוב' },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customer(businessId, customerId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.customers(businessId) });
      closeDelete();
      navigate('/business/customers');
    },
  });

  if (!activeBusiness) {
    return (
      <Container size="sm" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <StatusCard status="error" title="לא נבחר עסק" description="אנא בחר עסק מהתפריט העליון" />
      </Container>
    );
  }

  if (customerQuery.isPending) {
    return (
      <Container size="sm" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <StatusCard status="loading" title="טוען פרטי לקוח..." />
      </Container>
    );
  }

  if (customerQuery.error) {
    const message = extractErrorMessage(customerQuery.error, 'לא הצלחנו לטעון את פרטי הלקוח');
    return (
      <Container size="sm" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <StatusCard
          status="error"
          title="לא הצלחנו לטעון את פרטי הלקוח"
          description={message}
          primaryAction={{
            label: 'נסה שוב',
            onClick: () => customerQuery.refetch(),
            loading: customerQuery.isFetching,
          }}
        />
      </Container>
    );
  }

  const customer = customerQuery.data.customer;
  const initialCity = customer.city ?? '';
  const initialStreetAddress = customer.streetAddress ?? '';

  const formInitialValues: Partial<CustomerFormValues> = {
    name: customer.name,
    taxIdType: customer.taxIdType ?? 'none',
    taxId: customer.taxId ?? '',
    isLicensedDealer: customer.isLicensedDealer,
    city: customer.city ?? '',
    streetAddress: customer.streetAddress ?? '',
    postalCode: customer.postalCode ?? '',
    contactName: customer.contactName ?? '',
    email: customer.email ?? '',
    phone: customer.phone ?? '',
    notes: customer.notes ?? '',
  };

  return (
    <>
      <Container size="sm" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <Stack gap="md">
          <PageTitle order={3}>{customer.name}</PageTitle>

          <Paper withBorder radius="lg" p="lg">
            <CustomerForm
              key={customer.id}
              ref={formRef}
              initialValues={formInitialValues}
              onSubmit={(values) => updateMutation.mutate(buildUpdatePayload(values))}
              isPending={updateMutation.isPending}
              submitLabel="שמור שינויים"
              cancelLabel="ביטול"
              onCancel={() => navigate('/business/customers')}
              initialCity={initialCity}
              initialStreetAddress={initialStreetAddress}
            />
          </Paper>

          <Divider label="היסטוריית חשבוניות" labelPosition="center" />
          <Text c="dimmed">חשבוניות יוצגו כאן לאחר הוספת מודול חשבוניות</Text>

          <Divider label="מחיקה" labelPosition="center" color="red" />
          {/* TODO (Phase 2): Block delete if customer has finalized invoices. Show count and explanation. */}
          <Button variant="subtle" color="red" onClick={openDelete}>
            הסר לקוח
          </Button>
        </Stack>
      </Container>

      <Modal
        opened={deleteOpened}
        onClose={closeDelete}
        title="הסרת לקוח"
        centered
        overlayProps={{ blur: 2 }}
      >
        <Stack gap="md">
          <Text>האם להסיר את {customer.name}? הלקוח לא יופיע ברשימה אך הנתונים יישמרו.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={closeDelete} disabled={deleteMutation.isPending}>
              ביטול
            </Button>
            <Button
              color="red"
              loading={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              הסר
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
