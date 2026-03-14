import { Container, Grid, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconCash, IconFileInvoice, IconReceipt } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import type { DashboardKpis } from '@bon/types/dashboard';
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
  if (previous === 0) return undefined;
  return ((current - previous) / previous) * 100;
}

function trendProps(trend: number | undefined) {
  if (trend == null) return {};
  return { trend, trendLabel: 'מהחודש הקודם' };
}

function KpiCards(props: Readonly<{ kpis: DashboardKpis | null; isLoading: boolean }>) {
  if (props.isLoading || !props.kpis) {
    return (
      <>
        {Array.from({ length: 4 }, (_, i) => (
          <KpiCard key={i} label="" value="" icon={null} isLoading />
        ))}
      </>
    );
  }

  const { kpis } = props;
  const revenueTrend = computeTrend(
    kpis.revenue.thisMonthMinorUnits,
    kpis.revenue.prevMonthMinorUnits
  );
  const invoicesTrend = computeTrend(
    kpis.invoicesThisMonth.count,
    kpis.invoicesThisMonth.prevMonthCount
  );
  const overdueProps =
    kpis.overdue.count > 0
      ? { subtitle: formatCurrency(kpis.overdue.totalMinorUnits), accent: 'red' as const }
      : {};

  return (
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
        {...trendProps(revenueTrend)}
        icon={<IconReceipt size={20} />}
      />
      <KpiCard
        label="חשבוניות החודש"
        value={kpis.invoicesThisMonth.count.toLocaleString('he-IL')}
        {...trendProps(invoicesTrend)}
        icon={<IconFileInvoice size={20} />}
      />
      <KpiCard
        label="פגות מועד"
        value={kpis.overdue.count.toLocaleString('he-IL')}
        {...overdueProps}
        icon={<IconAlertTriangle size={20} />}
      />
    </>
  );
}

export function Dashboard() {
  const { businessId } = useParams<{ businessId: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.dashboard(businessId as string),
    queryFn: () => fetchDashboard(businessId as string),
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

  if (data && !data.hasInvoices) {
    return (
      <Container size="lg" mt="xl">
        <Stack gap="lg">
          <PageTitle order={3}>סקירה</PageTitle>
          <WelcomeState />
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="lg" mt="xl">
      <Stack gap="lg">
        <PageTitle order={3}>סקירה</PageTitle>

        <DashboardAlerts kpis={data?.kpis} isLoading={isLoading} />

        <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }}>
          <KpiCards kpis={data?.kpis ?? null} isLoading={isLoading} />
        </SimpleGrid>

        <Grid gutter="lg">
          <Grid.Col span={{ base: 12, md: 8 }}>
            <RecentInvoicesTable invoices={data?.recentInvoices} isLoading={isLoading} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Stack gap="lg">
              <QuickActions />
              <OverdueMiniList invoices={data?.overdueInvoices ?? []} isLoading={isLoading} />
            </Stack>
          </Grid.Col>
        </Grid>
      </Stack>
    </Container>
  );
}
