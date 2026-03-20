import { forwardRef, type ReactNode, useEffect, useImperativeHandle } from 'react';
import { Button, Group, Select, Stack, Switch, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { AddressAutocomplete } from './AddressAutocomplete';
import { validateIsraeliId } from '@bon/types/validation';
import type { TaxIdType } from '@bon/types/customers';

interface CustomerFormValues {
  name: string;
  taxIdType: TaxIdType;
  taxId: string;
  isLicensedDealer: boolean;
  city: string;
  streetAddress: string;
  postalCode: string;
  contactName: string;
  email: string;
  phone: string;
  notes: string;
}

export interface CustomerFormHandle {
  setFieldError: (field: string, error: ReactNode) => void;
}

interface CustomerFormProps {
  initialValues?: Partial<CustomerFormValues>;
  onSubmit: (values: CustomerFormValues) => void;
  isPending: boolean;
  submitLabel: string;
  cancelLabel: string;
  onCancel: () => void;
  initialCity?: string;
  initialStreetAddress?: string;
}

const TAX_ID_LABELS = {
  company_id: 'מספר חברה (ח.פ.)',
  vat_number: 'מספר עוסק מורשה (ע.מ.)',
  personal_id: 'מספר תעודת זהות (ת.ז.)',
} as const;

type TaxIdKey = keyof typeof TAX_ID_LABELS;

const TAX_ID_TYPE_OPTIONS: { value: TaxIdKey | 'none'; label: string }[] = [
  { value: 'none', label: 'ללא מספר מזהה' },
  { value: 'company_id', label: TAX_ID_LABELS.company_id },
  { value: 'vat_number', label: TAX_ID_LABELS.vat_number },
  { value: 'personal_id', label: TAX_ID_LABELS.personal_id },
];

function getNameLabel(taxIdType: TaxIdType): string {
  switch (taxIdType) {
    case 'company_id':
    case 'vat_number':
      return 'שם העסק';
    case 'personal_id':
      return 'שם מלא';
    default:
      return 'שם הלקוח';
  }
}

function getTaxIdLabel(taxIdType: TaxIdType): string {
  if (taxIdType in TAX_ID_LABELS) return TAX_ID_LABELS[taxIdType as TaxIdKey];
  return 'מספר מזהה';
}

const DEFAULT_VALUES: CustomerFormValues = {
  name: '',
  taxIdType: 'none',
  taxId: '',
  isLicensedDealer: false,
  city: '',
  streetAddress: '',
  postalCode: '',
  contactName: '',
  email: '',
  phone: '',
  notes: '',
};

export const CustomerForm = forwardRef<CustomerFormHandle, Readonly<CustomerFormProps>>(
  function CustomerForm(
    {
      initialValues,
      onSubmit,
      isPending,
      submitLabel,
      cancelLabel,
      onCancel,
      initialCity,
      initialStreetAddress,
    },
    ref
  ) {
    const form = useForm<CustomerFormValues>({
      initialValues: { ...DEFAULT_VALUES, ...initialValues },
      validate: {
        name: (value) => {
          const trimmed = value.trim();
          if (!trimmed) return 'שם נדרש';
          if (trimmed.length > 255) return 'השם ארוך מדי (עד 255 תווים)';
          return null;
        },
        taxId: (value, values) => {
          if (values.taxIdType === 'none') return null;
          if (!value) return null;
          if (!/^\d{9}$/.test(value)) return 'מספר מזהה חייב להיות 9 ספרות';
          if (values.taxIdType === 'personal_id' && !validateIsraeliId(value))
            return 'מספר ת.ז. לא תקין';
          return null;
        },
        email: (value) => {
          if (!value) return null;
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'כתובת אימייל לא תקינה';
          return null;
        },
        phone: (value) => {
          if (!value) return null;
          if (!/^0[2-9]\d{7,8}$/.test(value)) return 'מספר טלפון לא תקין (לדוגמה: 0501234567)';
          return null;
        },
      },
    });

    useImperativeHandle(ref, () => ({
      setFieldError: (field: string, error: ReactNode) => form.setFieldError(field, error),
    }));

    // Auto-reset isLicensedDealer when taxId is cleared or taxIdType changes to 'none'
    useEffect(() => {
      if (form.values.taxIdType === 'none' || !form.values.taxId) {
        if (form.values.isLicensedDealer) {
          form.setFieldValue('isLicensedDealer', false);
        }
      }
    }, [form.values.taxIdType, form.values.taxId, form.values.isLicensedDealer]);

    // Clear taxId when switching to 'none'
    useEffect(() => {
      if (form.values.taxIdType === 'none' && form.values.taxId) {
        form.setFieldValue('taxId', '');
      }
    }, [form.values.taxIdType, form.values.taxId]);

    const showTaxIdField = form.values.taxIdType !== 'none';
    const showLicensedDealer = showTaxIdField && !!form.values.taxId;

    const handleSubmit = form.onSubmit(onSubmit);

    return (
      <form onSubmit={handleSubmit} noValidate>
        <Stack gap="md">
          <TextInput
            label={getNameLabel(form.values.taxIdType)}
            required
            maxLength={255}
            {...form.getInputProps('name')}
          />

          <Select
            label="סוג מספר מזהה"
            data={TAX_ID_TYPE_OPTIONS}
            {...form.getInputProps('taxIdType')}
            allowDeselect={false}
          />

          {showTaxIdField && (
            <TextInput
              label={getTaxIdLabel(form.values.taxIdType)}
              maxLength={9}
              inputMode="numeric"
              {...form.getInputProps('taxId')}
            />
          )}

          {showLicensedDealer && (
            <Switch
              label="עוסק מורשה"
              description="לקוח זה הוא עוסק מורשה ונדרש מספר הקצאה על חשבוניות מעל הסף"
              checked={form.values.isLicensedDealer}
              onChange={(event) =>
                form.setFieldValue('isLicensedDealer', event.currentTarget.checked)
              }
            />
          )}

          <AddressAutocomplete
            key={`addr-${initialCity ?? ''}`}
            form={form}
            disabled={isPending}
            required={false}
            initialCity={initialCity ?? ''}
            initialStreetAddress={initialStreetAddress ?? ''}
          />

          <TextInput label="שם איש קשר" {...form.getInputProps('contactName')} />

          <TextInput label="אימייל" type="email" {...form.getInputProps('email')} />

          <TextInput label="טלפון" placeholder="05X-XXXXXXX" {...form.getInputProps('phone')} />

          <Textarea
            label="הערות פנימיות"
            description="לא יופיע בחשבונית"
            styles={{ input: { backgroundColor: 'var(--mantine-color-gray-0)' } }}
            {...form.getInputProps('notes')}
          />

          <Group justify="space-between">
            <Button variant="subtle" onClick={onCancel} disabled={isPending}>
              {cancelLabel}
            </Button>
            <Button type="submit" loading={isPending}>
              {submitLabel}
            </Button>
          </Group>
        </Stack>
      </form>
    );
  }
);

export type { CustomerFormValues };
