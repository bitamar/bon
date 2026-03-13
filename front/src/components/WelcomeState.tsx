import { Button, Card, Stack, Text, Title } from '@mantine/core';
import { IconFileInvoice, IconUserPlus } from '@tabler/icons-react';
import { Link, useParams } from 'react-router-dom';

export function WelcomeState() {
  const { businessId } = useParams<{ businessId: string }>();

  return (
    <Card withBorder radius="lg" p="xl" maw={500} mx="auto">
      <Stack align="center" gap="lg">
        <Title order={3}>!BON-ברוכים הבאים ל</Title>
        <Text c="dimmed" ta="center">
          התחילו בהפקת החשבונית הראשונה שלכם, או הוסיפו לקוח כדי להתחיל
        </Text>
        <Button
          component={Link}
          to={`/businesses/${businessId}/invoices/new`}
          leftSection={<IconFileInvoice size={18} />}
          size="md"
        >
          חשבונית חדשה
        </Button>
        <Button
          component={Link}
          to={`/businesses/${businessId}/customers/new`}
          variant="light"
          leftSection={<IconUserPlus size={18} />}
          size="md"
        >
          הוסף לקוח
        </Button>
      </Stack>
    </Card>
  );
}
