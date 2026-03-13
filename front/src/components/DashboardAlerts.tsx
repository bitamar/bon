import { Alert, Stack } from '@mantine/core';
import { IconAlertTriangle, IconFileInvoice } from '@tabler/icons-react';
import { Link, useParams } from 'react-router-dom';
import type { DashboardKpis } from '@bon/types/dashboard';

export function DashboardAlerts({ kpis }: Readonly<{ kpis: DashboardKpis }>) {
  const { businessId } = useParams<{ businessId: string }>();
  const alerts: { color: string; icon: typeof IconAlertTriangle; message: string; to: string }[] =
    [];

  if (kpis.staleDraftCount > 0) {
    alerts.push({
      color: 'yellow',
      icon: IconFileInvoice,
      message: `${kpis.staleDraftCount} טיוטות ממתינות להפקה`,
      to: `/businesses/${businessId}/invoices?status=draft`,
    });
  }

  if (alerts.length === 0) return null;

  return (
    <Stack gap="xs">
      {alerts.map((alert) => (
        <Alert
          key={alert.message}
          color={alert.color}
          icon={<alert.icon size={18} />}
          radius="md"
          variant="light"
        >
          <Link to={alert.to} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 500 }}>
            {alert.message}
          </Link>
        </Alert>
      ))}
    </Stack>
  );
}
