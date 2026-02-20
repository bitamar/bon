import { useState } from 'react';
import {
  Anchor,
  Button,
  Center,
  Container,
  Group,
  Modal,
  Paper,
  Radio,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { BrandLogo } from '../components/BrandLogo';
import { useForm } from '@mantine/form';
import { useApiMutation } from '../lib/useApiMutation';
import { createBusiness } from '../api/businesses';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import type { BusinessType } from '@bon/types/businesses';
import { validateIsraeliId } from '@bon/types/validation';
import { HttpError } from '../lib/http';

type OnboardingFormValues = {
  name: string;
  businessType: BusinessType | '';
  registrationNumber: string;
};

export function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [typeModalOpen, setTypeModalOpen] = useState(false);

  const form = useForm<OnboardingFormValues>({
    initialValues: {
      name: '',
      businessType: '',
      registrationNumber: '',
    },
    validate: {
      businessType: (value) => (value ? null : 'יש לבחור סוג עסק'),
      name: (value) => (value?.trim() ? null : 'שם נדרש'),
      registrationNumber: (value, values) => {
        if (!value?.trim()) return 'מספר רישום נדרש';
        if (!/^\d{9}$/.test(value)) return 'מספר רישום חייב להיות 9 ספרות';
        if (values.businessType === 'exempt_dealer' && !validateIsraeliId(value)) {
          return 'מספר ת.ז. לא תקין';
        }
        return null;
      },
    },
  });

  const createMutation = useApiMutation({
    mutationFn: createBusiness,
    successToast: { message: 'העסק נוצר! השלם את הפרופיל כדי להנפיק חשבוניות.' },
    errorToast: { fallbackMessage: 'שגיאה ביצירת העסק' },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.userBusinesses() });
      navigate('/business/settings');
    },
    onError: (error) => {
      if (
        error instanceof HttpError &&
        (error.body as { code?: string } | undefined)?.code === 'duplicate_registration_number'
      ) {
        form.setFieldError('registrationNumber', 'מספר רישום זה כבר קיים במערכת');
      }
    },
  });

  const isPending = createMutation.isPending;

  const handleBusinessTypeChange = (value: string) => {
    const next = value as BusinessType;
    form.setFieldValue('businessType', next);
    form.setFieldValue('registrationNumber', '');
    form.clearFieldError('registrationNumber');
  };

  const getRegistrationLabel = () => {
    switch (form.values.businessType) {
      case 'exempt_dealer':
        return 'מספר תעודת זהות (ת.ז.)';
      case 'licensed_dealer':
        return 'מספר עוסק מורשה (ע.מ.)';
      case 'limited_company':
        return 'מספר חברה (ח.פ.)';
      default:
        return 'מספר רישום';
    }
  };

  const getNameLabel = () => {
    switch (form.values.businessType) {
      case 'exempt_dealer':
        return 'שם מלא (כפי שמופיע בתעודת הזהות)';
      case 'licensed_dealer':
        return 'שם העסק';
      case 'limited_company':
        return 'שם החברה';
      default:
        return 'שם';
    }
  };

  const onSubmit = form.onSubmit((values) => {
    if (!values.businessType) return;
    createMutation.mutate({
      name: values.name,
      businessType: values.businessType,
      registrationNumber: values.registrationNumber,
      defaultVatRate: values.businessType === 'exempt_dealer' ? 0 : undefined,
    });
  });

  return (
    <Center
      style={{
        minHeight: '100dvh',
        background: 'linear-gradient(150deg, #fffbf5 0%, #ecf5e0 100%)',
      }}
      p="md"
    >
      <Container size={480} w="100%">
        <Stack gap="xl">
          <BrandLogo subtitle="צור את העסק שלך" />

          <Paper
            shadow="xs"
            radius="xl"
            p="xl"
            style={{ border: '1px solid var(--mantine-color-lime-2)' }}
          >
            <form onSubmit={onSubmit}>
              <Stack gap="md">
                <Radio.Group
                  {...form.getInputProps('businessType')}
                  onChange={handleBusinessTypeChange}
                >
                  <Stack gap="xs">
                    {(
                      [
                        [
                          'licensed_dealer',
                          'עוסק מורשה',
                          'עסק יחיד או שותפות שגובה מע״מ. מחזור שנתי מעל ₪120,000',
                        ],
                        [
                          'exempt_dealer',
                          'עוסק פטור',
                          'עצמאי שמחזורו מתחת ל-₪120,000. פטור מגביית מע״מ',
                        ],
                        ['limited_company', 'חברה בע״מ', 'חברה פרטית הרשומה ברשם החברות (ח.פ.)'],
                      ] as const
                    ).map(([value, label, description]) => (
                      <Radio.Card
                        key={value}
                        value={value}
                        radius="md"
                        p="md"
                        withBorder
                        style={
                          form.values.businessType === value
                            ? { borderColor: 'var(--mantine-color-lime-6)' }
                            : undefined
                        }
                      >
                        <Group wrap="nowrap" align="flex-start">
                          <Radio.Indicator />
                          <Stack gap={4}>
                            <Text fw={500}>{label}</Text>
                            <Text size="sm" c="dimmed">
                              {description}
                            </Text>
                          </Stack>
                        </Group>
                      </Radio.Card>
                    ))}
                  </Stack>
                </Radio.Group>

                <Anchor
                  component="button"
                  type="button"
                  size="sm"
                  onClick={() => setTypeModalOpen(true)}
                >
                  לא בטוח? קרא עוד
                </Anchor>

                {form.values.businessType && (
                  <>
                    <TextInput
                      label={getNameLabel()}
                      required
                      {...form.getInputProps('name')}
                      disabled={isPending}
                    />

                    <TextInput
                      label={getRegistrationLabel()}
                      required
                      placeholder="123456789"
                      maxLength={9}
                      {...form.getInputProps('registrationNumber')}
                      disabled={isPending}
                    />

                    <Button type="submit" size="lg" fullWidth loading={isPending}>
                      צור עסק
                    </Button>
                  </>
                )}
              </Stack>
            </form>
          </Paper>
        </Stack>
      </Container>

      <Modal
        opened={typeModalOpen}
        onClose={() => setTypeModalOpen(false)}
        title="סוגי עסקים בישראל"
        centered
        padding={32}
      >
        <Stack gap="xl">
          <Stack gap="xs">
            <Text fw={600}>עוסק מורשה</Text>
            <Text size="sm" c="dimmed">
              עצמאי או שותפות עם מחזור שנתי מעל ₪120,000. חייב לגבות מע״מ מלקוחותיו ולהעביר לרשות
              המיסים. מקבל מספר עוסק מורשה (ע.מ.) מרשות המיסים.
            </Text>
          </Stack>
          <Stack gap="xs">
            <Text fw={600}>עוסק פטור</Text>
            <Text size="sm" c="dimmed">
              עצמאי עם מחזור שנתי מתחת ל-₪120,000. פטור מגביית מע״מ ואינו מנפיק חשבוניות מס. מזדהה
              באמצעות תעודת זהות.
            </Text>
          </Stack>
          <Stack gap="xs">
            <Text fw={600}>חברה בע״מ</Text>
            <Text size="sm" c="dimmed">
              ישות משפטית נפרדת הרשומה ברשם החברות. מקבלת מספר חברה (ח.פ.) ייחודי. חייבת בגביית
              מע״מ.
            </Text>
          </Stack>
        </Stack>
      </Modal>
    </Center>
  );
}
