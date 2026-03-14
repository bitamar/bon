import { Alert, Card, Container, Grid, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconCash, IconClock, IconFileInvoice } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { PageTitle } from '../components/PageTitle';
import { KpiCard } from '../components/KpiCard';
import { RecentInvoicesTable } from '../components/RecentInvoicesTable';
import { QuickActions } from '../components/QuickActions';
import { fetchDashboard } from '../api/dashboard';
import { queryKeys } from '../lib/queryKeys';
import { formatMinorUnits } from '@bon/types/formatting';
import type { DashboardResponse } from '@bon/types/dashboard';

function trendPercent(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function buildKpis(data: DashboardResponse, businessId: string) {
  const revenueTrend = trendPercent(
    data.revenueThisMonthMinorUnits,
    data.revenuePrevMonthMinorUnits
  );
  const countTrend = trendPercent(data.invoiceCountThisMonth, data.invoiceCountPrevMonth);

  return [
    {
      label: 'הכנסות החודש',
      value: formatMinorUnits(data.revenueThisMonthMinorUnits),
      trend: revenueTrend,
      trendLabel: 'מהחודש הקודם',
      icon: <IconCash size={20} />,
      href: `/businesses/${businessId}/invoices?status=finalized,sent,paid,partially_paid`,
    },
    {
      label: 'חשבוניות החודש',
      value: data.invoiceCountThisMonth.toLocaleString('he-IL'),
      trend: countTrend,
      trendLabel: 'מהחודש הקודם',
      icon: <IconFileInvoice size={20} />,
      href: `/businesses/${businessId}/invoices`,
    },
    {
      label: 'ממתין לתשלום',
      value: formatMinorUnits(data.outstandingAmountMinorUnits),
      trend: 0,
      trendLabel: `${data.outstandingCount} חשבוניות`,
      icon: <IconClock size={20} />,
      href: `/businesses/${businessId}/invoices?status=finalized,sent,partially_paid`,
    },
    {
      label: 'פגות מועד',
      value: formatMinorUnits(data.overdueAmountMinorUnits),
      trend: 0,
      trendLabel: `${data.overdueCount} חשבוניות`,
      icon: <IconAlertTriangle size={20} />,
      href: `/businesses/${businessId}/invoices?status=finalized,sent,partially_paid`,
      color: data.overdueCount > 0 ? 'red' : undefined,
    },
  ];
}

function ShaamStatusCard({
  pendingCount,
  rejectedCount,
}: Readonly<{ pendingCount: number; rejectedCount: number }>) {
  if (pendingCount === 0 && rejectedCount === 0) return null;

  return (
    <Card withBorder radius="lg" p="lg">
      <Text fw={600} mb="md">
        סטטוס שע&quot;מ
      </Text>
      <Stack gap="xs">
        {pendingCount > 0 && (
          <Group gap="xs">
            <IconClock size={16} color="var(--mantine-color-yellow-6)" />
            <Text size="sm">{pendingCount} בקשות ממתינות להקצאה</Text>
          </Group>
        )}
        {rejectedCount > 0 && (
          <Group gap="xs">
            <IconAlertTriangle size={16} color="var(--mantine-color-red-6)" />
            <Text size="sm" c="red">
              {rejectedCount} בקשות נדחו
            </Text>
          </Group>
        )}
      </Stack>
    </Card>
  );
}

export function Dashboard() {
  const { businessId = '' } = useParams<{ businessId: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.dashboard(businessId),
    queryFn: () => fetchDashboard(businessId),
    enabled: !!businessId,
  });

  if (error) {
    return (
      <Container size="lg" mt="xl">
        <Alert color="red" title="שגיאה">
          שגיאה בטעינת הנתונים
        </Alert>
      </Container>
    );
  }

  const kpis = data ? buildKpis(data, businessId) : [];

  return (
    <Container size="lg" mt="xl">
      <Stack gap="lg">
        <PageTitle order={3}>דאשבורד</PageTitle>

        <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }}>
          {isLoading
            ? Array.from({ length: 4 }, (_, i) => (
                <KpiCard key={i} label="" value="" trend={0} trendLabel="" icon={null} isLoading />
              ))
            : kpis.map((kpi) => (
                <KpiCard
                  key={kpi.label}
                  label={kpi.label}
                  value={kpi.value}
                  trend={kpi.trend}
                  trendLabel={kpi.trendLabel}
                  icon={kpi.icon}
                  href={kpi.href}
                  {...(kpi.color ? { color: kpi.color } : {})}
                />
              ))}
        </SimpleGrid>

        <Grid gutter="lg">
          <Grid.Col span={{ base: 12, md: 8 }}>
            <RecentInvoicesTable
              invoices={data?.recentInvoices}
              businessId={businessId}
              isLoading={isLoading}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Stack gap="lg">
              <QuickActions />
              {data && (
                <ShaamStatusCard
                  pendingCount={data.shaamPendingCount}
                  rejectedCount={data.shaamRejectedCount}
                />
              )}
            </Stack>
          </Grid.Col>
        </Grid>
      </Stack>
    </Container>
  );
}
