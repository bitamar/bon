import { Card, Container, Stack, Text } from '@mantine/core';
import { PageTitle } from '../components/PageTitle';

export function Dashboard() {
  return (
    <Container size="lg" mt="xl">
      <Stack gap="md">
        <PageTitle order={3}>ראשי</PageTitle>
        <Card withBorder radius="lg" p="lg">
          <Stack gap="sm">
            <Text fw={600}>הכל מוכן.</Text>
            <Text c="dimmed" size="sm">
              המערכת מוכנה לשימוש. ניתן להתחיל להוסיף לקוחות וליצור חשבוניות.
            </Text>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
