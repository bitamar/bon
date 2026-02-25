import { Alert, Button, Group, Modal, Select, Stack } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useState } from 'react';

export const OTHER_REASON = 'אחר — פרט בהערות';

export const VAT_EXEMPTION_REASONS = [
  'ייצוא שירותים §30(א)(5)',
  'ייצוא טובין §30(א)(1)',
  'עסקה עם גוף מדינה',
  'מוסד ללא כוונת רווח — §30(א)(2)',
  OTHER_REASON,
] as const;

interface VatExemptionReasonModalProps {
  opened: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  invoiceNotes: string;
}

export function VatExemptionReasonModal({
  opened,
  onClose,
  onConfirm,
  invoiceNotes,
}: Readonly<VatExemptionReasonModalProps>) {
  const [reason, setReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setReason(null);
    setError(null);
    onClose();
  }

  function handleConfirm() {
    if (!reason) {
      setError('יש לבחור סיבת פטור');
      return;
    }

    if (reason === OTHER_REASON && !invoiceNotes.trim()) {
      setError('בחרת "אחר" — יש להוסיף הסבר בשדה ההערות של החשבונית');
      return;
    }

    setError(null);
    onConfirm(reason);
  }

  return (
    <Modal opened={opened} onClose={handleClose} title='סיבת פטור ממע"מ' centered size="sm">
      <Stack gap="md">
        {error && (
          <Alert color="red" icon={<IconAlertTriangle size={18} />}>
            {error}
          </Alert>
        )}

        <Select
          label='סיבת פטור ממע"מ'
          placeholder="בחר סיבה..."
          data={VAT_EXEMPTION_REASONS.map((r) => ({ value: r, label: r }))}
          value={reason}
          onChange={(value) => {
            setReason(value);
            setError(null);
          }}
          required
          allowDeselect={false}
        />

        <Group justify="flex-end">
          <Button variant="subtle" onClick={handleClose}>
            ביטול
          </Button>
          <Button onClick={handleConfirm}>המשך</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
