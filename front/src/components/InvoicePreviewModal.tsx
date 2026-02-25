import { Alert, Button, Divider, Group, Modal, Paper, Stack, Table, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { DOCUMENT_TYPE_LABELS, type DocumentType } from '@bon/types/invoices';
import { calculateInvoiceTotals, calculateLine } from '@bon/types/vat';
import { formatMinorUnits, toMinorUnits } from '@bon/types/formatting';
import { TotalRow } from './TotalRow';
import { InvoiceAnnotation } from './InvoiceAnnotation';
import { computeVatLabel } from '../lib/vatLabel';
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
  const computedItems = items.map((row) => {
    const input = {
      quantity: row.quantity,
      unitPriceMinorUnits: toMinorUnits(row.unitPrice),
      discountPercent: row.discountPercent,
      vatRateBasisPoints: row.vatRateBasisPoints,
    };
    return { row, input, result: calculateLine(input) };
  });

  const totals = calculateInvoiceTotals(computedItems.map((c) => c.input));
  const vatLabel = computeVatLabel(items.map((i) => i.vatRateBasisPoints));

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
                {computedItems.map(({ row, input, result }, index) => (
                  <Table.Tr key={row.key}>
                    <Table.Td>{index + 1}</Table.Td>
                    <Table.Td>{row.description}</Table.Td>
                    <Table.Td>{row.quantity}</Table.Td>
                    <Table.Td>{formatMinorUnits(input.unitPriceMinorUnits)}</Table.Td>
                    <Table.Td>{row.discountPercent > 0 ? `${row.discountPercent}%` : '—'}</Table.Td>
                    <Table.Td>{formatMinorUnits(result.lineTotalMinorUnits)}</Table.Td>
                    <Table.Td>{formatMinorUnits(result.vatAmountMinorUnits)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>

            <Stack gap={4} maw={300} ms="auto">
              <TotalRow
                label="סה״כ לפני הנחה"
                value={formatMinorUnits(totals.subtotalMinorUnits)}
              />
              {totals.discountMinorUnits > 0 && (
                <TotalRow label="הנחה" value={formatMinorUnits(totals.discountMinorUnits)} />
              )}
              <TotalRow
                label="סה״כ לפני מע״מ"
                value={formatMinorUnits(totals.totalExclVatMinorUnits)}
              />
              <TotalRow label={vatLabel} value={formatMinorUnits(totals.vatMinorUnits)} />
              <Group justify="space-between" mt="xs">
                <Text fw={700}>סה״כ לתשלום</Text>
                <Text fw={700}>{formatMinorUnits(totals.totalInclVatMinorUnits)}</Text>
              </Group>
            </Stack>

            {vatExemptionReason && (
              <InvoiceAnnotation label='סיבת פטור ממע"מ' value={vatExemptionReason} />
            )}

            {notes && <InvoiceAnnotation label="הערות" value={notes} />}
          </Stack>
        </Paper>

        <Alert color="blue" icon={<IconInfoCircle size={18} />}>
          הסכומים יחושבו מחדש בשרת בעת ההפקה
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
