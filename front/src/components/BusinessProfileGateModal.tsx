import { Alert, Button, Group, Modal, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useState } from 'react';
import { updateBusiness } from '../api/businesses';
import { extractErrorMessage } from '../lib/notifications';
import type { Business, BusinessType, UpdateBusinessBody } from '@bon/types/businesses';

interface MissingFields {
  name: boolean;
  streetAddress: boolean;
  city: boolean;
  vatNumber: boolean;
}

export function getMissingBusinessFields(
  business: Readonly<Business>,
  businessType: BusinessType
): MissingFields {
  return {
    name: !business.name?.trim(),
    streetAddress: !business.streetAddress?.trim(),
    city: !business.city?.trim(),
    vatNumber: businessType !== 'exempt_dealer' && !business.vatNumber?.trim(),
  };
}

export function hasIncompleteProfile(
  business: Readonly<Business>,
  businessType: BusinessType
): boolean {
  const missing = getMissingBusinessFields(business, businessType);
  return Object.values(missing).some(Boolean);
}

interface BusinessProfileGateModalProps {
  opened: boolean;
  onClose: () => void;
  onSaved: () => void;
  business: Readonly<Business>;
  businessType: BusinessType;
}

export function BusinessProfileGateModal({
  opened,
  onClose,
  onSaved,
  business,
  businessType,
}: Readonly<BusinessProfileGateModalProps>) {
  const missing = getMissingBusinessFields(business, businessType);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    initialValues: {
      name: business.name ?? '',
      streetAddress: business.streetAddress ?? '',
      city: business.city ?? '',
      vatNumber: business.vatNumber ?? '',
    },
    validate: {
      name: (value) => (missing.name && !value.trim() ? 'שם העסק נדרש' : null),
      streetAddress: (value) => (missing.streetAddress && !value.trim() ? 'כתובת נדרשת' : null),
      city: (value) => (missing.city && !value.trim() ? 'עיר נדרשת' : null),
      vatNumber: (value) =>
        missing.vatNumber && !value.trim()
          ? 'מספר מע"מ נדרש'
          : missing.vatNumber && value.trim() && !/^\d{9}$/.test(value)
            ? 'מספר מע"מ חייב להיות 9 ספרות'
            : null,
    },
  });

  const handleSubmit = form.onSubmit(async (values) => {
    setSaving(true);
    setError(null);
    try {
      const payload: UpdateBusinessBody = {};
      if (missing.name) payload.name = values.name;
      if (missing.streetAddress) payload.streetAddress = values.streetAddress;
      if (missing.city) payload.city = values.city;
      if (missing.vatNumber) payload.vatNumber = values.vatNumber;

      await updateBusiness(business.id, payload);
      onSaved();
    } catch (err) {
      setError(extractErrorMessage(err, 'לא הצלחנו לשמור את פרטי העסק'));
    } finally {
      setSaving(false);
    }
  });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="נדרש להשלים פרטי עסק"
      centered
      closeOnClickOutside={false}
      size="md"
    >
      <form onSubmit={handleSubmit} noValidate>
        <Stack gap="md">
          <Alert color="yellow" icon={<IconAlertTriangle size={18} />}>
            יש להשלים את הפרטים הבאים לפני הפקת חשבונית
          </Alert>

          {error && (
            <Alert color="red" icon={<IconAlertTriangle size={18} />}>
              {error}
            </Alert>
          )}

          {missing.name && <TextInput label="שם העסק" required {...form.getInputProps('name')} />}

          {missing.streetAddress && (
            <TextInput label="כתובת" required {...form.getInputProps('streetAddress')} />
          )}

          {missing.city && <TextInput label="עיר" required {...form.getInputProps('city')} />}

          {missing.vatNumber && (
            <TextInput
              label='מספר מע"מ'
              required
              maxLength={9}
              placeholder="123456789"
              {...form.getInputProps('vatNumber')}
            />
          )}

          <Group justify="flex-end">
            <Button variant="subtle" onClick={onClose} disabled={saving}>
              ביטול
            </Button>
            <Button type="submit" loading={saving}>
              שמור והמשך
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
