import { Alert, Button, Divider, Group, Modal, Paper, Stack, Table, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { DOCUMENT_TYPE_LABELS, type DocumentType } from '@bon/types/invoices';
import { calculateInvoiceTotals, calculateLine } from '@bon/types/vat';
import { formatMinorUnits, toMinorUnits } from '@bon/types/formatting';
import type { LineItemFormRow } from './InvoiceLineItems';

interface CustomerInfo {
  name: string;
  taxId?: string | null;
  city?: string | null;
}

interface InvoicePreviewModalProps {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  confirming: boolean;
  documentType: DocumentType;
  invoiceDate: string | null;
  customer: CustomerInfo | null;
  items: ReadonlyArray<Readonly<LineItemFormRow>>;
  notes: string;
  vatExemptionReason: string | null;
}

export function InvoicePreviewModal({
  opened,
  onClose,
  onConfirm,
  confirming,
  documentType,
  invoiceDate,
  customer,
  items,
  notes,
  vatExemptionReason,
}: Readonly<InvoicePreviewModalProps>) {
  const lineInputs = items.map((row) => ({
    quantity: row.quantity,
    unitPriceMinorUnits: toMinorUnits(row.unitPrice),
    discountPercent: row.discountPercent,
    vatRateBasisPoints: row.vatRateBasisPoints,
  }));

  const totals = calculateInvoiceTotals(lineInputs);

  const vatRates = new Set(items.map((i) => i.vatRateBasisPoints));
  const vatLabel =
    vatRates.size === 1
      ? ([...vatRates][0] ?? 0) === 0
        ? 'פטור ממע״מ'
        : `מע״מ ${([...vatRates][0] ?? 0) / 100}%`
      : 'מע״מ';

  return (
    <Modal opened={opened} onClose={onClose} title="תצוגה מקדימה — לפני הפקה" centered size="xl">
      <Stack gap="md">
        <Paper withBorder p="md" radius="md">
          <Stack gap="sm">
            <Group justify="space-between">
              <Stack gap={2}>
                <Text fw={600} size="lg">
                  {DOCUMENT_TYPE_LABELS[documentType]}
                </Text>
                <Text size="sm" c="dimmed">
                  מספר יוקצה בהפקה
                </Text>
              </Stack>
              {invoiceDate && (
                <Text size="sm" c="dimmed">
                  תאריך: {invoiceDate}
                </Text>
              )}
            </Group>

            <Divider />

            {customer && (
              <Stack gap={2}>
                <Text size="sm" fw={500}>
                  לכבוד:
                </Text>
                <Text size="sm">{customer.name}</Text>
                {customer.taxId && (
                  <Text size="sm" c="dimmed">
                    {customer.taxId}
                  </Text>
                )}
                {customer.city && (
                  <Text size="sm" c="dimmed">
                    {customer.city}
                  </Text>
                )}
              </Stack>
            )}

            <Divider />

            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>#</Table.Th>
                  <Table.Th>תיאור</Table.Th>
                  <Table.Th>כמות</Table.Th>
                  <Table.Th>מחיר יח׳</Table.Th>
                  <Table.Th>הנחה %</Table.Th>
                  <Table.Th>סה"כ</Table.Th>
                  <Table.Th>מע"מ</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {items.map((item, index) => {
                  const line = calculateLine({
                    quantity: item.quantity,
                    unitPriceMinorUnits: toMinorUnits(item.unitPrice),
                    discountPercent: item.discountPercent,
                    vatRateBasisPoints: item.vatRateBasisPoints,
                  });
                  return (
                    <Table.Tr key={item.key}>
                      <Table.Td>{index + 1}</Table.Td>
                      <Table.Td>{item.description}</Table.Td>
                      <Table.Td>{item.quantity}</Table.Td>
                      <Table.Td>{formatMinorUnits(toMinorUnits(item.unitPrice))}</Table.Td>
                      <Table.Td>
                        {item.discountPercent > 0 ? `${item.discountPercent}%` : '—'}
                      </Table.Td>
                      <Table.Td>{formatMinorUnits(line.lineTotalMinorUnits)}</Table.Td>
                      <Table.Td>{formatMinorUnits(line.vatAmountMinorUnits)}</Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>

            <Stack gap={4} maw={300} ms="auto">
              <TotalRow
                label="סה״כ לפני מע״מ"
                value={formatMinorUnits(totals.totalExclVatMinorUnits)}
              />
              {totals.discountMinorUnits > 0 && (
                <TotalRow label="הנחה" value={formatMinorUnits(totals.discountMinorUnits)} />
              )}
              <TotalRow label={vatLabel} value={formatMinorUnits(totals.vatMinorUnits)} />
              <Group justify="space-between" mt="xs">
                <Text fw={700}>סה״כ לתשלום</Text>
                <Text fw={700}>{formatMinorUnits(totals.totalInclVatMinorUnits)}</Text>
              </Group>
            </Stack>

            {vatExemptionReason && (
              <>
                <Divider />
                <Text size="sm">
                  <Text span fw={500}>
                    סיבת פטור ממע"מ:{' '}
                  </Text>
                  {vatExemptionReason}
                </Text>
              </>
            )}

            {notes && (
              <>
                <Divider />
                <Text size="sm">
                  <Text span fw={500}>
                    הערות:{' '}
                  </Text>
                  {notes}
                </Text>
              </>
            )}
          </Stack>
        </Paper>

        <Alert color="blue" icon={<IconInfoCircle size={18} />}>
          הסכומות יחושבו מחדש בשרת בעת ההפקה
        </Alert>

        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose} disabled={confirming}>
            חזרה לעריכה
          </Button>
          <Button onClick={onConfirm} loading={confirming}>
            אשר והפק
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function TotalRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <Group justify="space-between">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text size="sm">{value}</Text>
    </Group>
  );
}
