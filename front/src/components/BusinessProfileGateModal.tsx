import { Alert, Button, Group, Modal, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useState } from 'react';
import { updateBusiness } from '../api/businesses';
import { extractErrorMessage } from '../lib/notifications';
import { AddressAutocomplete, type AddressFormAdapter } from './AddressAutocomplete';
import type { Business, BusinessType, UpdateBusinessBody } from '@bon/types/businesses';

interface MissingFields {
  name: boolean;
  address: boolean;
  vatNumber: boolean;
}

export function getMissingBusinessFields(
  business: Readonly<Business>,
  businessType: BusinessType
): MissingFields {
  return {
    name: !business.name?.trim(),
    address: !business.streetAddress?.trim() || !business.city?.trim(),
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
      postalCode: business.postalCode ?? '',
      vatNumber: business.vatNumber ?? '',
    },
    validate: {
      name: (value) => (value.trim() ? null : 'שם העסק נדרש'),
      city: (value) => (value.trim() ? null : 'עיר נדרשת'),
      streetAddress: (value) => (value.trim() ? null : 'כתובת נדרשת'),
      vatNumber: (value) => {
        if (businessType === 'exempt_dealer') return null;
        if (!value.trim()) return 'מספר מע"מ נדרש';
        if (!/^\d{9}$/.test(value)) return 'מספר מע"מ חייב להיות 9 ספרות';
        return null;
      },
    },
  });

  function handleClose() {
    setError(null);
    form.resetDirty();
    form.resetTouched();
    onClose();
  }

  const addressAdapter: AddressFormAdapter = {
    getInputProps: (field) => form.getInputProps(field),
    setFieldValue: (field, value) => form.setFieldValue(field, value),
  };

  const handleSubmit = form.onSubmit(async (values) => {
    setSaving(true);
    setError(null);
    try {
      const payload: UpdateBusinessBody = {};
      if (missing.name) payload.name = values.name;
      if (missing.address) {
        payload.streetAddress = values.streetAddress;
        payload.city = values.city;
        if (values.postalCode.trim()) payload.postalCode = values.postalCode;
      }
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
      onClose={handleClose}
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

          {missing.address && (
            <AddressAutocomplete
              form={addressAdapter}
              initialCity={business.city ?? ''}
              initialStreetAddress={business.streetAddress ?? ''}
            />
          )}

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
            <Button variant="subtle" onClick={handleClose} disabled={saving}>
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
