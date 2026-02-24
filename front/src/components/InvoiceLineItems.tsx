import {
  ActionIcon,
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { calculateLine } from '@bon/types/vat';
import { formatAgora, shekelToAgora } from '@bon/types/formatting';

export interface LineItemFormRow {
  key: string;
  description: string;
  catalogNumber: string;
  quantity: number;
  unitPriceShekel: number;
  discountPercent: number;
  vatRateBasisPoints: number;
}

interface InvoiceLineItemsProps {
  items: LineItemFormRow[];
  onChange: (items: LineItemFormRow[]) => void;
  vatLocked: boolean;
  defaultVatRate: number;
}

const VAT_OPTIONS = [
  { value: '1700', label: '17%' },
  { value: '0', label: 'פטור' },
];

function computeLineTotal(row: Readonly<LineItemFormRow>): number {
  const result = calculateLine({
    quantity: row.quantity,
    unitPriceAgora: shekelToAgora(row.unitPriceShekel),
    discountPercent: row.discountPercent,
    vatRateBasisPoints: row.vatRateBasisPoints,
  });
  return result.lineTotalInclVatAgora;
}

export function InvoiceLineItems({
  items,
  onChange,
  vatLocked,
  defaultVatRate,
}: Readonly<InvoiceLineItemsProps>) {
  function updateRow(index: number, patch: Partial<LineItemFormRow>) {
    const updated = items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    onChange(updated);
  }

  function removeRow(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function addRow() {
    onChange([
      ...items,
      {
        key: crypto.randomUUID(),
        description: '',
        catalogNumber: '',
        quantity: 1,
        unitPriceShekel: 0,
        discountPercent: 0,
        vatRateBasisPoints: defaultVatRate,
      },
    ]);
  }

  return (
    <Stack gap="xs">
      {items.map((row, index) => (
        <Group key={row.key} gap="xs" align="flex-end" wrap="nowrap">
          <TextInput
            label={index === 0 ? 'תיאור' : undefined}
            placeholder="תיאור פריט"
            value={row.description}
            onChange={(e) => updateRow(index, { description: e.currentTarget.value })}
            required
            style={{ flex: 1 }}
          />
          <NumberInput
            label={index === 0 ? 'כמות' : undefined}
            value={row.quantity}
            onChange={(val) => updateRow(index, { quantity: typeof val === 'number' ? val : 1 })}
            min={0.001}
            decimalScale={3}
            defaultValue={1}
            w={80}
          />
          <NumberInput
            label={index === 0 ? 'מחיר יח׳' : undefined}
            value={row.unitPriceShekel}
            onChange={(val) =>
              updateRow(index, { unitPriceShekel: typeof val === 'number' ? val : 0 })
            }
            prefix="₪"
            decimalScale={2}
            min={0}
            w={110}
          />
          <NumberInput
            label={index === 0 ? 'הנחה %' : undefined}
            value={row.discountPercent}
            onChange={(val) =>
              updateRow(index, { discountPercent: typeof val === 'number' ? val : 0 })
            }
            suffix="%"
            min={0}
            max={100}
            w={80}
          />
          <Select
            label={index === 0 ? 'מע״מ' : undefined}
            data={VAT_OPTIONS}
            value={String(row.vatRateBasisPoints)}
            onChange={(val) => updateRow(index, { vatRateBasisPoints: Number(val) })}
            disabled={vatLocked}
            allowDeselect={false}
            w={90}
          />
          <Text
            size="sm"
            fw={500}
            w={100}
            ta="left"
            style={{ whiteSpace: 'nowrap' }}
            {...(index === 0 ? { pb: 0 } : {})}
          >
            {formatAgora(computeLineTotal(row))}
          </Text>
          {items.length > 1 ? (
            <ActionIcon
              variant="subtle"
              color="red"
              onClick={() => removeRow(index)}
              aria-label="הסר שורה"
            >
              <IconTrash size={16} />
            </ActionIcon>
          ) : (
            <ActionIcon variant="subtle" color="red" disabled style={{ visibility: 'hidden' }}>
              <IconTrash size={16} />
            </ActionIcon>
          )}
        </Group>
      ))}
      <Button
        variant="light"
        size="xs"
        leftSection={<IconPlus size={14} />}
        onClick={addRow}
        mt="xs"
        w="fit-content"
      >
        הוסף שורה
      </Button>
    </Stack>
  );
}
