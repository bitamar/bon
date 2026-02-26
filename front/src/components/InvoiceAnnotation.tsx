import { Divider, Text } from '@mantine/core';

export function InvoiceAnnotation({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <>
      <Divider />
      <Text size="sm">
        <Text span fw={500}>
          {label}:{' '}
        </Text>
        {value}
      </Text>
    </>
  );
}
