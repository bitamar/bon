import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IconCheck, IconCrown } from '@tabler/icons-react';
import { PageTitle } from '../components/PageTitle';
import { StatusCard } from '../components/StatusCard';
import { FormSkeleton } from '../components/FormSkeleton';
import { useApiMutation } from '../lib/useApiMutation';
import { queryKeys } from '../lib/queryKeys';
import {
  fetchSubscription,
  createCheckout,
  startTrial,
  cancelSubscription,
} from '../api/subscriptions';
import {
  PLAN_PRICES,
  PLAN_LABELS,
  STATUS_LABELS,
  TRIAL_DAYS,
  type SubscriptionPlan,
} from '@bon/types/subscriptions';

function formatPrice(minorUnits: number): string {
  return `₪${(minorUnits / 100).toLocaleString('he-IL', { minimumFractionDigits: 0 })}`;
}

function PlanCard({
  plan,
  selected,
  onSelect,
}: Readonly<{ plan: SubscriptionPlan; selected: boolean; onSelect: () => void }>) {
  const price = PLAN_PRICES[plan];
  const monthlyPrice = plan === 'yearly' ? Math.round(price / 12) : price;
  const savings = plan === 'yearly' ? PLAN_PRICES['monthly'] * 12 - price : 0;

  return (
    <Card
      withBorder
      padding="lg"
      radius="md"
      style={{
        borderColor: selected ? 'var(--mantine-color-blue-6)' : undefined,
        borderWidth: selected ? 2 : 1,
        cursor: 'pointer',
      }}
      onClick={onSelect}
    >
      <Stack gap="xs">
        <Group justify="space-between">
          <Text fw={600} size="lg">
            {PLAN_LABELS[plan]}
          </Text>
          {plan === 'yearly' && (
            <Badge color="green" variant="light">
              חיסכון {formatPrice(savings)}
            </Badge>
          )}
        </Group>
        <Group gap={4} align="baseline">
          <Title order={2}>{formatPrice(monthlyPrice)}</Title>
          <Text c="dimmed" size="sm">
            / חודש
          </Text>
        </Group>
        {plan === 'yearly' && (
          <Text c="dimmed" size="sm">
            {formatPrice(price)} לשנה
          </Text>
        )}
        <Stack gap={4} mt="xs">
          <FeatureItem text="חשבוניות ללא הגבלה" />
          <FeatureItem text="ניהול לקוחות" />
          <FeatureItem text="הפקת PDF" />
          <FeatureItem text="שליחה במייל" />
          <FeatureItem text="חיבור SHAAM" />
        </Stack>
      </Stack>
    </Card>
  );
}

function FeatureItem({ text }: Readonly<{ text: string }>) {
  return (
    <Group gap={6}>
      <IconCheck size={16} color="var(--mantine-color-green-6)" />
      <Text size="sm">{text}</Text>
    </Group>
  );
}

export function Subscription() {
  const { businessId = '' } = useParams<{ businessId: string }>();
  const queryClient = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>('monthly');

  const subscriptionQuery = useQuery({
    queryKey: queryKeys.subscription(businessId),
    queryFn: () => fetchSubscription(businessId),
    enabled: !!businessId,
  });

  const trialMutation = useApiMutation({
    mutationFn: () => startTrial(businessId),
    successToast: { message: 'תקופת הניסיון החלה!' },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.subscription(businessId) });
    },
  });

  const checkoutMutation = useApiMutation({
    mutationFn: (plan: SubscriptionPlan) =>
      createCheckout(
        businessId,
        plan,
        `${window.location.origin}/businesses/${businessId}/subscription?success=true`,
        `${window.location.origin}/businesses/${businessId}/subscription?cancelled=true`
      ),
    errorToast: { fallbackMessage: 'שגיאה ביצירת עמוד תשלום' },
    onSuccess: (data) => {
      window.location.href = data.paymentUrl;
    },
  });

  const cancelMutation = useApiMutation({
    mutationFn: () => cancelSubscription(businessId),
    successToast: { message: 'המנוי בוטל' },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.subscription(businessId) });
    },
  });

  if (subscriptionQuery.isLoading) {
    return (
      <Container size="sm">
        <PageTitle mb="lg">מנוי ותשלום</PageTitle>
        <FormSkeleton rows={3} />
      </Container>
    );
  }

  if (subscriptionQuery.isError) {
    return (
      <Container size="sm">
        <PageTitle mb="lg">מנוי ותשלום</PageTitle>
        <StatusCard
          status="error"
          title="שגיאה בטעינת נתוני המנוי"
          primaryAction={{
            label: 'נסו שוב',
            onClick: () => subscriptionQuery.refetch(),
          }}
        />
      </Container>
    );
  }

  const data = subscriptionQuery.data;
  const sub = data?.subscription;
  const hasActiveSub = data?.canCreateInvoices === true;

  // Active subscription view
  if (sub && hasActiveSub) {
    return (
      <Container size="sm">
        <PageTitle mb="lg">מנוי ותשלום</PageTitle>
        <Card withBorder padding="xl">
          <Stack gap="md">
            <Group justify="space-between">
              <Group gap="xs">
                <IconCrown size={24} color="var(--mantine-color-yellow-6)" />
                <Text fw={600} size="lg">
                  מנוי {PLAN_LABELS[sub.plan]}
                </Text>
              </Group>
              <Badge color={sub.status === 'active' ? 'green' : 'yellow'} variant="light" size="lg">
                {STATUS_LABELS[sub.status]}
              </Badge>
            </Group>

            {data.daysRemaining != null && (
              <Text c="dimmed">
                {sub.status === 'trialing'
                  ? `נותרו ${data.daysRemaining} ימים בתקופת הניסיון`
                  : `המנוי מתחדש בעוד ${data.daysRemaining} ימים`}
              </Text>
            )}

            {sub.status === 'trialing' && (
              <Card withBorder padding="md" bg="blue.0">
                <Stack gap="xs">
                  <Text fw={500}>שדרגו למנוי מלא</Text>
                  <Text size="sm" c="dimmed">
                    בחרו תוכנית כדי להמשיך להשתמש ב-BON אחרי תקופת הניסיון
                  </Text>
                  <SegmentedControl
                    value={selectedPlan}
                    onChange={(v) => setSelectedPlan(v as SubscriptionPlan)}
                    data={[
                      { label: `חודשי — ${formatPrice(PLAN_PRICES.monthly)}`, value: 'monthly' },
                      { label: `שנתי — ${formatPrice(PLAN_PRICES.yearly)}`, value: 'yearly' },
                    ]}
                  />
                  <Button
                    onClick={() => checkoutMutation.mutate(selectedPlan)}
                    loading={checkoutMutation.isPending}
                  >
                    עברו לתשלום
                  </Button>
                </Stack>
              </Card>
            )}

            {sub.status === 'active' && (
              <Button
                variant="subtle"
                color="red"
                onClick={() => cancelMutation.mutate()}
                loading={cancelMutation.isPending}
              >
                ביטול מנוי
              </Button>
            )}
          </Stack>
        </Card>
      </Container>
    );
  }

  // No subscription — show pricing
  return (
    <Container size="md">
      <Stack gap="xl" align="center" mb="xl">
        <PageTitle ta="center">בחרו תוכנית</PageTitle>
        <Text c="dimmed" ta="center" maw={500}>
          התחילו עם {TRIAL_DAYS} ימי ניסיון חינם, ללא התחייבות. אחרי הניסיון בחרו תוכנית שמתאימה
          לעסק שלכם.
        </Text>
      </Stack>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg" maw={600} mx="auto">
        <PlanCard
          plan="monthly"
          selected={selectedPlan === 'monthly'}
          onSelect={() => setSelectedPlan('monthly')}
        />
        <PlanCard
          plan="yearly"
          selected={selectedPlan === 'yearly'}
          onSelect={() => setSelectedPlan('yearly')}
        />
      </SimpleGrid>

      <Stack gap="sm" align="center" mt="xl">
        <Button
          size="lg"
          onClick={() => checkoutMutation.mutate(selectedPlan)}
          loading={checkoutMutation.isPending}
        >
          התחילו עם {formatPrice(PLAN_PRICES[selectedPlan])}{' '}
          {selectedPlan === 'yearly' ? 'לשנה' : 'לחודש'}
        </Button>
        <Button
          variant="subtle"
          onClick={() => trialMutation.mutate()}
          loading={trialMutation.isPending}
        >
          או התחילו {TRIAL_DAYS} ימי ניסיון חינם
        </Button>
      </Stack>
    </Container>
  );
}
