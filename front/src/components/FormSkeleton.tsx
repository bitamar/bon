import { Card, Group, Skeleton, Stack } from '@mantine/core';

/**
 * Skeleton placeholder for form pages. Renders rows that mimic
 * the shape of typical form fields (label + input).
 */
export function FormSkeleton({ rows = 4 }: Readonly<{ rows?: number }>) {
  return (
    <Card withBorder padding="xl" data-testid="form-skeleton">
      <Stack gap="md">
        {Array.from({ length: rows }, (_, i) => (
          <Stack key={i} gap={6}>
            <Skeleton height={14} width="20%" />
            <Skeleton height={36} />
          </Stack>
        ))}
        <Group justify="flex-end" mt="xs">
          <Skeleton height={36} width={120} />
        </Group>
      </Stack>
    </Card>
  );
}
