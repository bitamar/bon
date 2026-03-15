import { useEffect, useRef } from 'react';
import { Button, Center, Container, Loader, Stack, Text } from '@mantine/core';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { StatusCard } from '../components/StatusCard';
import { useApiMutation } from '../lib/useApiMutation';
import { createInvoiceDraft } from '../api/invoices';
import { useBusiness } from '../contexts/BusinessContext';
import { HttpError } from '../lib/http';
import type { InvoiceResponse } from '@bon/types/invoices';

export function InvoiceNew() {
  const navigate = useNavigate();
  const { activeBusiness } = useBusiness();
  const { businessId = '' } = useParams<{ businessId: string }>();
  const calledRef = useRef(false);

  const createMutation = useApiMutation<InvoiceResponse>({
    mutationFn: () => createInvoiceDraft(businessId, { documentType: 'tax_invoice' }),
    successToast: false,
    errorToast: false,
    onSuccess: (data) => {
      navigate(`/businesses/${businessId}/invoices/${data.invoice.id}/edit`, { replace: true });
    },
  });

  const mutateRef = useRef(createMutation.mutate);
  mutateRef.current = createMutation.mutate;

  useEffect(() => {
    if (activeBusiness && !calledRef.current) {
      calledRef.current = true;
      mutateRef.current();
    }
  }, [activeBusiness]);

  if (!activeBusiness) {
    return (
      <Container size="sm" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <StatusCard status="error" title="לא נבחר עסק" description="אנא בחר עסק מהתפריט העליון" />
      </Container>
    );
  }

  if (createMutation.isError) {
    const isSubscriptionError =
      createMutation.error instanceof HttpError &&
      createMutation.error.code === 'subscription_required';

    return (
      <Container size="sm" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        {isSubscriptionError ? (
          <StatusCard
            status="error"
            title="נדרש מנוי פעיל"
            description="כדי ליצור חשבוניות יש להפעיל מנוי. ניתן להתחיל עם תקופת ניסיון חינמית."
            primaryAction={{
              label: 'מעבר לעמוד מנויים',
              onClick: () => navigate(`/businesses/${businessId}/subscription`),
            }}
            secondaryAction={
              <Button variant="subtle" component={Link} to={`/businesses/${businessId}/invoices`}>
                חזרה לחשבוניות
              </Button>
            }
          />
        ) : (
          <StatusCard
            status="error"
            title="לא הצלחנו ליצור טיוטה"
            description="אירעה שגיאה ביצירת הטיוטה"
            primaryAction={{
              label: 'נסה שוב',
              onClick: () => createMutation.mutate(),
              loading: createMutation.isPending,
            }}
          />
        )}
      </Container>
    );
  }

  return (
    <Container size="sm" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
      <Center py="xl">
        <Stack align="center" gap="xs">
          <Loader size="sm" />
          <Text c="dimmed" size="sm">
            יוצר טיוטה...
          </Text>
        </Stack>
      </Center>
    </Container>
  );
}
