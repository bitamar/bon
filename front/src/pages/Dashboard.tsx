import { Card, Container, Stack, Text } from '@mantine/core';
import { PageTitle } from '../components/PageTitle';

export function Dashboard() {
  return (
    <Container size="lg" mt="xl">
      <Stack gap="md">
        <PageTitle order={3}>Dashboard</PageTitle>
        <Card withBorder radius="lg" p="lg">
          <Stack gap="sm">
            <Text fw={600}>You&apos;re all set.</Text>
            <Text c="dimmed" size="sm">
              This starter leaves the business logic up to you. Wire up new pages, connect data
              sources, and shape the experience to match your product.
            </Text>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
