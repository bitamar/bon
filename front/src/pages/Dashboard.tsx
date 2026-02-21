import { Container, Grid, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconCash, IconFileInvoice, IconReceipt, IconUsers } from '@tabler/icons-react';
import { PageTitle } from '../components/PageTitle';
import { KpiCard } from '../components/KpiCard';
import { RecentInvoicesTable } from '../components/RecentInvoicesTable';
import { QuickActions } from '../components/QuickActions';
import { ActivityFeed } from '../components/ActivityFeed';
import { useDashboardData, formatCurrency } from '../hooks/useDashboardData';

const KPI_ICONS = [
  <IconCash size={20} key="cash" />,
  <IconFileInvoice size={20} key="invoice" />,
  <IconUsers size={20} key="users" />,
  <IconReceipt size={20} key="receipt" />,
];

function formatKpiValue(value: number, prefix?: string): string {
  if (prefix === '₪') return formatCurrency(value);
  return value.toLocaleString('he-IL');
}

export function Dashboard() {
  const { data, isLoading, error } = useDashboardData();

  if (error) {
    return (
      <Container size="lg" mt="xl">
        <Text c="red" ta="center">
          שגיאה בטעינת הנתונים
        </Text>
      </Container>
    );
  }

  return (
    <Container size="lg" mt="xl">
      <Stack gap="lg">
        <PageTitle order={3}>ראשי</PageTitle>

        <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }}>
          {isLoading
            ? Array.from({ length: 4 }, (_, i) => (
                <KpiCard key={i} label="" value="" trend={0} trendLabel="" icon={null} isLoading />
              ))
            : data?.kpis.map((kpi, i) => (
                <KpiCard
                  key={kpi.label}
                  label={kpi.label}
                  value={formatKpiValue(kpi.value, kpi.prefix)}
                  trend={kpi.trend}
                  trendLabel={kpi.trendLabel}
                  icon={KPI_ICONS[i]}
                />
              ))}
        </SimpleGrid>

        <Grid gutter="lg">
          <Grid.Col span={{ base: 12, md: 8 }}>
            <Stack gap="lg">
              <RecentInvoicesTable invoices={data?.recentInvoices} isLoading={isLoading} />
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Stack gap="lg">
              <QuickActions />
              <ActivityFeed items={data?.activityItems} isLoading={isLoading} />
            </Stack>
          </Grid.Col>
        </Grid>
      </Stack>
    </Container>
  );
}
