import { useState } from 'react';
import {
  Anchor,
  Button,
  Container,
  Group,
  MantineProvider,
  Modal,
  Paper,
  Radio,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { AnimatedBackground } from '../components/AnimatedBackground';
import { useForm } from '@mantine/form';
import { useApiMutation } from '../lib/useApiMutation';
import { createBusiness } from '../api/businesses';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import type { BusinessListResponse, BusinessType } from '@bon/types/businesses';
import { validateIsraeliId } from '@bon/types/validation';
import { HttpError } from '../lib/http';
import { showErrorNotification } from '../lib/notifications';
import { useBusiness } from '../contexts/BusinessContext';

const BUSINESS_TYPE_OPTIONS = [
  ['licensed_dealer', 'עוסק מורשה', 'עסק יחיד או שותפות שגובה מע״מ. מחזור שנתי מעל ₪120,000'],
  ['exempt_dealer', 'עוסק פטור', 'עצמאי שמחזורו מתחת ל-₪120,000. פטור מגביית מע״מ'],
  ['limited_company', 'חברה בע״מ', 'חברה פרטית הרשומה ברשם החברות (ח.פ.)'],
] as const;

type OnboardingFormValues = {
  name: string;
  businessType: BusinessType | '';
  registrationNumber: string;
};

export function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { businesses } = useBusiness();
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
    successToast: { message: 'העסק נוצר בהצלחה!' },
    errorToast: false,
    onSuccess: (data) => {
      queryClient.setQueryData<BusinessListResponse>(queryKeys.userBusinesses(), (old) => ({
        businesses: [
          ...(old?.businesses ?? []),
          {
            id: data.business.id,
            name: data.business.name,
            businessType: data.business.businessType,
            registrationNumber: data.business.registrationNumber,
            isActive: data.business.isActive,
            role: data.role,
          },
        ],
      }));
      navigate('/business/settings');
    },
    onError: (error) => {
      if (
        error instanceof HttpError &&
        (error.body as { error?: string } | undefined)?.error === 'duplicate_registration_number'
      ) {
        form.setFieldError('registrationNumber', 'מספר רישום זה כבר קיים במערכת');
        return;
      }
      showErrorNotification('לא הצלחנו ליצור את העסק, נסו שוב');
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
        return 'מספר תעודת זהות';
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
    createMutation.mutate({
      name: values.name,
      businessType: values.businessType as BusinessType,
      registrationNumber: values.registrationNumber,
    });
  });

  return (
    <AnimatedBackground>
      <Container
        size={520}
        w="100%"
        px="md"
        pt={{ base: 'xl', sm: 80 }}
        pb="xl"
        style={{ minHeight: '100dvh' }}
      >
        <Stack gap="xl">
          <Stack align="center" gap={6}>
            <Title
              order={1}
              style={{ fontSize: '4rem', letterSpacing: '-0.04em', fontWeight: 1000 }}
              c="brand.6"
            >
              bon
            </Title>
            <Text size="lg" c="rgba(255, 255, 255, 0.5)" fw={400}>
              יצירת העסק שלך
            </Text>
          </Stack>

          <MantineProvider forceColorScheme="light">
            <Paper
              radius="xl"
              p="xl"
              className="fadeInUp"
              style={{
                background: '#ffffff',
                border: '1px solid var(--mantine-color-gray-2)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
              }}
            >
              <form onSubmit={onSubmit} noValidate>
                <Stack gap="md">
                  <Radio.Group
                  {...form.getInputProps('businessType')}
                  onChange={handleBusinessTypeChange}
                >
                  <Stack gap="xs">
                    {BUSINESS_TYPE_OPTIONS.map(([value, label, description]) => (
                      <Radio.Card
                        key={value}
                        value={value}
                        radius="md"
                        p="md"
                        withBorder
                        style={
                          form.values.businessType === value
                            ? {
                                borderColor: 'var(--mantine-color-brand-6)',
                                borderRightWidth: 3,
                                borderRightColor: 'var(--mantine-color-brand-6)',
                              }
                            : { borderColor: 'var(--mantine-color-gray-2)' }
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
                  לא בטוחים? מידע נוסף
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
                      inputMode="numeric"
                      {...form.getInputProps('registrationNumber')}
                      disabled={isPending}
                    />

                    <Button type="submit" size="lg" fullWidth loading={isPending}>
                      יצירת עסק
                    </Button>

                    {businesses.length > 0 && (
                      <Anchor
                        component="button"
                        type="button"
                        size="sm"
                        ta="center"
                        onClick={() => navigate(-1)}
                      >
                        ביטול
                      </Anchor>
                    )}
                  </>
                )}
                </Stack>
              </form>
            </Paper>
          </MantineProvider>
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
    </AnimatedBackground>
  );
}
