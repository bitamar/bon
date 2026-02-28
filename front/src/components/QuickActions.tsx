import { Button, Card, SimpleGrid, Text } from '@mantine/core';
import { IconFileInvoice, IconSettings, IconUserPlus } from '@tabler/icons-react';
import { Link, useParams } from 'react-router-dom';

export function QuickActions() {
  const { businessId } = useParams<{ businessId: string }>();

  return (
    <Card withBorder radius="lg" p="lg">
      <Text fw={600} mb="md">
        פעולות מהירות
      </Text>
      <SimpleGrid cols={1} spacing="xs">
        <Button
          component={Link}
          to={`/businesses/${businessId}/invoices/new`}
          variant="light"
          leftSection={<IconFileInvoice size={18} />}
          justify="start"
          fullWidth
        >
          חשבונית חדשה
        </Button>
        <Button
          component={Link}
          to={`/businesses/${businessId}/customers/new`}
          variant="light"
          leftSection={<IconUserPlus size={18} />}
          justify="start"
          fullWidth
        >
          הוסף לקוח
        </Button>
        <Button
          component={Link}
          to={`/businesses/${businessId}/settings`}
          variant="light"
          leftSection={<IconSettings size={18} />}
          justify="start"
          fullWidth
        >
          הגדרות עסק
        </Button>
      </SimpleGrid>
    </Card>
  );
}
