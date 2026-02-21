import { useRef } from 'react';
import { Anchor, Container, Paper, Stack } from '@mantine/core';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { PageTitle } from '../components/PageTitle';
import { StatusCard } from '../components/StatusCard';
import {
  CustomerForm,
  type CustomerFormHandle,
  type CustomerFormValues,
} from '../components/CustomerForm';
import { useApiMutation } from '../lib/useApiMutation';
import { createCustomer } from '../api/customers';
import { queryKeys } from '../lib/queryKeys';
import { useBusiness } from '../contexts/BusinessContext';
import { HttpError } from '../lib/http';
import { showErrorNotification, extractErrorMessage } from '../lib/notifications';
import type { CreateCustomerBody } from '@bon/types/customers';

function buildCreatePayload(values: CustomerFormValues): CreateCustomerBody {
  return {
    name: values.name,
    ...(values.taxIdType !== 'none' && { taxIdType: values.taxIdType }),
    ...(values.taxIdType !== 'none' && values.taxId && { taxId: values.taxId }),
    ...(values.isLicensedDealer && { isLicensedDealer: true }),
    ...(values.email && { email: values.email }),
    ...(values.phone && { phone: values.phone }),
    ...(values.city && { city: values.city }),
    ...(values.streetAddress && { streetAddress: values.streetAddress }),
    ...(values.postalCode && { postalCode: values.postalCode }),
    ...(values.contactName && { contactName: values.contactName }),
    ...(values.notes && { notes: values.notes }),
  } as CreateCustomerBody;
}

export function CustomerCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeBusiness } = useBusiness();
  const formRef = useRef<CustomerFormHandle>(null);

  const businessId = activeBusiness?.id ?? '';

  const createMutation = useApiMutation({
    mutationFn: (data: CreateCustomerBody) => createCustomer(businessId, data),
    errorToast: false,
    successToast: { message: 'הלקוח נוצר בהצלחה' },
    onError: (error) => {
      if (error instanceof HttpError && error.status === 409) {
        const body = error.body as
          | {
              error?: string;
              details?: { existingCustomerId?: string; existingCustomerName?: string };
            }
          | undefined;
        if (body?.error === 'duplicate_tax_id') {
          if (body.details?.existingCustomerId && body.details?.existingCustomerName) {
            formRef.current?.setFieldError(
              'taxId',
              <>
                {`מספר מזהה זה כבר קיים עבור ${body.details.existingCustomerName} `}
                <Anchor
                  component={Link}
                  to={`/business/customers/${body.details.existingCustomerId}`}
                  size="sm"
                >
                  עבור ללקוח הקיים
                </Anchor>
              </>
            );
          } else {
            formRef.current?.setFieldError('taxId', 'מספר מזהה זה כבר קשור ללקוח קיים');
          }
          return;
        }
      }
      showErrorNotification(extractErrorMessage(error, 'משהו לא עבד, נסו שוב'));
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers(businessId) });
      navigate(`/business/customers/${data.customer.id}`);
    },
  });

  if (!activeBusiness) {
    return (
      <Container size="sm" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <StatusCard status="error" title="לא נבחר עסק" description="אנא בחר עסק מהתפריט העליון" />
      </Container>
    );
  }

  return (
    <Container size="sm" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
      <Stack gap="md">
        <PageTitle order={3}>לקוח חדש</PageTitle>
        <Paper withBorder radius="lg" p="lg">
          <CustomerForm
            ref={formRef}
            onSubmit={(values) => createMutation.mutate(buildCreatePayload(values))}
            isPending={createMutation.isPending}
            submitLabel="שמור"
            cancelLabel="ביטול"
            onCancel={() => navigate('/business/customers')}
          />
        </Paper>
      </Stack>
    </Container>
  );
}
