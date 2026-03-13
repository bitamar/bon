import { Container, Grid, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconCash, IconFileInvoice, IconReceipt } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { PageTitle } from '../components/PageTitle';
import { KpiCard } from '../components/KpiCard';
import { RecentInvoicesTable } from '../components/RecentInvoicesTable';
import { QuickActions } from '../components/QuickActions';
import { DashboardAlerts } from '../components/DashboardAlerts';
import { OverdueMiniList } from '../components/OverdueMiniList';
import { WelcomeState } from '../components/WelcomeState';
import { fetchDashboard } from '../api/dashboard';
import { queryKeys } from '../lib/queryKeys';
import { formatCurrency } from '../lib/format';

function computeTrend(current: number, previous: number): number | undefined {
  if (previous === 0) return current > 0 ? 100 : undefined;
  return ((current - previous) / previous) * 100;
}

export function Dashboard() {
  const { businessId } = useParams<{ businessId: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.dashboard(businessId!),
    queryFn: () => fetchDashboard(businessId!),
    enabled: !!businessId,
  });

  if (error) {
    return (
      <Container size="lg" mt="xl">
        <Text c="red" ta="center">
          שגיאה בטעינת הנתונים
        </Text>
      </Container>
    );
  }

  // Show welcome state for new businesses with no finalized invoices
  if (!isLoading && data && !data.hasInvoices) {
    return (
      <Container size="lg" mt="xl">
        <Stack gap="lg">
          <PageTitle order={3}>סקירה</PageTitle>
          <WelcomeState />
        </Stack>
      </Container>
    );
  }

  const kpis = data?.kpis;
  const revenueTrend = kpis
    ? computeTrend(kpis.revenue.thisMonthMinorUnits, kpis.revenue.prevMonthMinorUnits)
    : undefined;
  const invoicesTrend = kpis
    ? computeTrend(kpis.invoicesThisMonth.count, kpis.invoicesThisMonth.prevMonthCount)
    : undefined;

  return (
    <Container size="lg" mt="xl">
      <Stack gap="lg">
        <PageTitle order={3}>סקירה</PageTitle>

        {kpis ? <DashboardAlerts kpis={kpis} /> : null}

        <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }}>
          {isLoading ? (
            Array.from({ length: 4 }, (_, i) => (
              <KpiCard key={i} label="" value="" icon={null} isLoading />
            ))
          ) : kpis ? (
            <>
              <KpiCard
                label="ממתין לתשלום"
                value={formatCurrency(kpis.outstanding.totalMinorUnits)}
                subtitle={`${kpis.outstanding.count} חשבוניות`}
                icon={<IconCash size={20} />}
              />
              <KpiCard
                label="גבייה החודש"
                value={formatCurrency(kpis.revenue.thisMonthMinorUnits)}
                {...(revenueTrend != null
                  ? { trend: revenueTrend, trendLabel: 'מהחודש הקודם' }
                  : {})}
                icon={<IconReceipt size={20} />}
              />
              <KpiCard
                label="חשבוניות החודש"
                value={kpis.invoicesThisMonth.count.toLocaleString('he-IL')}
                {...(invoicesTrend != null
                  ? { trend: invoicesTrend, trendLabel: 'מהחודש הקודם' }
                  : {})}
                icon={<IconFileInvoice size={20} />}
              />
              <KpiCard
                label="פגות מועד"
                value={kpis.overdue.count.toLocaleString('he-IL')}
                {...(kpis.overdue.count > 0
                  ? {
                      subtitle: formatCurrency(kpis.overdue.totalMinorUnits),
                      accent: 'red' as const,
                    }
                  : {})}
                icon={<IconAlertTriangle size={20} />}
              />
            </>
          ) : null}
        </SimpleGrid>

        <Grid gutter="lg">
          <Grid.Col span={{ base: 12, md: 8 }}>
            <RecentInvoicesTable invoices={data?.recentInvoices} isLoading={isLoading} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Stack gap="lg">
              <QuickActions />
              <OverdueMiniList invoices={data?.overdueInvoices ?? []} />
            </Stack>
          </Grid.Col>
        </Grid>
      </Stack>
    </Container>
  );
}
