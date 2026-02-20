import { useRef, useState } from 'react';
import {
  ActionIcon,
  Anchor,
  Button,
  Center,
  Collapse,
  Container,
  Group,
  Modal,
  NumberInput,
  Paper,
  Radio,
  Stack,
  Stepper,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconInfoCircle } from '@tabler/icons-react';
import { useApiMutation } from '../lib/useApiMutation';
import { createBusiness } from '../api/businesses';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import type { BusinessType, CreateBusinessBody } from '@bon/types/businesses';
import { validateIsraeliId } from '@bon/types/validation';
import { AddressAutocomplete } from '../components/AddressAutocomplete';
import { HttpError } from '../lib/http';

function getVatLabel(businessType: BusinessType) {
  switch (businessType) {
    case 'licensed_dealer':
      return 'מספר רישום מע״מ';
    case 'limited_company':
      return 'מספר מע"מ';
    case 'exempt_dealer':
      return 'מספר מע"מ';
  }
}

function getVatDescription(businessType: BusinessType) {
  switch (businessType) {
    case 'licensed_dealer':
      return 'בדרך כלל זהה למספר הרישום';
    case 'limited_company':
      return 'בדרך כלל זהה לח.פ.';
    case 'exempt_dealer':
      return 'עוסק פטור אינו חייב במספר מע״מ';
  }
}

function getVatTooltip(businessType: BusinessType) {
  switch (businessType) {
    case 'licensed_dealer':
      return 'מספר העוסק המורשה שקיבלת מרשות המיסים. בדרך כלל זהה למספר הרישום (ת.ז. של בעל העסק)';
    case 'limited_company':
      return 'מספר המע״מ של החברה. בדרך כלל זהה למספר הח.פ.';
    case 'exempt_dealer':
      return 'עוסק פטור אינו רשום לצורכי מע״מ ולכן אינו זקוק למספר זה';
  }
}

function InfoTooltip({ label }: Readonly<{ label: string }>) {
  return (
    <Tooltip label={label} multiline w={240} withArrow>
      <ActionIcon variant="subtle" color="gray" size="sm">
        <IconInfoCircle size={16} />
      </ActionIcon>
    </Tooltip>
  );
}

export function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const vatManuallyEdited = useRef(false);

  const form = useForm<CreateBusinessBody>({
    initialValues: {
      name: '',
      businessType: '' as BusinessType,
      registrationNumber: '',
      vatNumber: undefined,
      streetAddress: '',
      city: '',
      postalCode: undefined,
      phone: undefined,
      email: undefined,
      invoiceNumberPrefix: undefined,
      startingInvoiceNumber: 1,
      defaultVatRate: 1700,
    },
    validate: {
      name: (value) => (value?.trim() ? null : 'שם נדרש'),
      registrationNumber: (value, values) => {
        if (!value?.trim()) return 'מספר רישום נדרש';
        if (!/^\d{9}$/.test(value)) return 'מספר רישום חייב להיות 9 ספרות';
        if (values.businessType === 'exempt_dealer' && !validateIsraeliId(value)) {
          return 'מספר ת.ז. לא תקין';
        }
        return null;
      },
      vatNumber: (value, values) => {
        if (values.businessType === 'exempt_dealer') return null;
        if (!value) return 'מספר מע"מ נדרש';
        if (!/^\d{9}$/.test(value)) return 'מספר מע"מ חייב להיות 9 ספרות';
        return null;
      },
      streetAddress: (value) => (value?.trim() ? null : 'כתובת רחוב נדרשת'),
      city: (value) => (value?.trim() ? null : 'עיר נדרשת'),
      postalCode: (value) => {
        if (value && !/^\d{7}$/.test(value)) return 'מיקוד חייב להיות 7 ספרות';
        return null;
      },
      phone: (value) => {
        if (value && !/^0[2-9]\d{7,8}$/.test(value)) return 'מספר טלפון לא תקין';
        return null;
      },
      email: (value) => {
        if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'כתובת אימייל לא תקינה';
        return null;
      },
    },
  });

  const createMutation = useApiMutation({
    mutationFn: createBusiness,
    successToast: { message: 'העסק נוצר בהצלחה!' },
    errorToast: { fallbackMessage: 'שגיאה ביצירת העסק' },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.userBusinesses() });
      navigate('/');
    },
    onError: (error) => {
      if (
        error instanceof HttpError &&
        (error.body as { code?: string } | undefined)?.code === 'duplicate_registration_number'
      ) {
        setStep(1);
        form.setFieldError('registrationNumber', 'מספר רישום זה כבר קיים במערכת');
      }
    },
  });

  const isPending = createMutation.isPending;
  const isExempt = form.values.businessType === 'exempt_dealer';

  const handleRegistrationNumberBlur = () => {
    const regNum = form.values.registrationNumber;
    if (/^\d{9}$/.test(regNum) && !isExempt && !vatManuallyEdited.current) {
      form.setFieldValue('vatNumber', regNum);
    }
  };

  const handleBusinessTypeChange = (value: string) => {
    const prev = form.values.businessType;
    const next = value as BusinessType;
    form.setFieldValue('businessType', next);

    if (prev !== next) {
      form.setFieldValue('name', '');
      form.setFieldValue('registrationNumber', '');
      form.setFieldValue('vatNumber', undefined);
      vatManuallyEdited.current = false;
    }
  };

  const goToStep1 = () => {
    if (!form.values.businessType) return;
    setStep(1);
  };

  const goToStep2 = () => {
    const fields: (keyof CreateBusinessBody)[] = ['name', 'registrationNumber'];
    if (form.values.businessType !== 'exempt_dealer') fields.push('vatNumber');
    const results = fields.map((f) => form.validateField(f));
    if (results.some((r) => r.hasError)) return;
    setStep(2);
  };

  const onSubmit = form.onSubmit((values) => {
    const payload: CreateBusinessBody = {
      ...values,
      vatNumber:
        values.businessType === 'exempt_dealer' ? undefined : values.vatNumber || undefined,
      postalCode: values.postalCode || undefined,
      phone: values.phone || undefined,
      email: values.email || undefined,
      invoiceNumberPrefix: values.invoiceNumberPrefix || undefined,
      defaultVatRate: values.businessType === 'exempt_dealer' ? 0 : values.defaultVatRate,
    };
    createMutation.mutate(payload);
  });

  const handleStepClick = (clicked: number) => {
    if (clicked < step) {
      setStep(clicked);
    }
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

  return (
    <Center style={{ minHeight: '100dvh' }} p="md">
      <Container size={600} w="100%">
        <Stack gap="xl">
          <Stack gap="xs" align="center">
            <Title order={1} ta="center">
              BON
            </Title>
            <Text size="lg" ta="center" c="dimmed">
              בואו ניצור את העסק הראשון שלכם
            </Text>
          </Stack>

          <Paper shadow="md" radius="lg" p="xl" withBorder>
            <Stack gap="xl">
              <Stepper active={step} onStepClick={handleStepClick}>
                <Stepper.Step label="סוג עסק" />
                <Stepper.Step label="פרטי העסק" />
                <Stepper.Step label="כתובת ויצירת קשר" />
              </Stepper>

              {/* Step 0: Business type */}
              {step === 0 && (
                <Stack gap="md">
                  <Radio.Group
                    {...form.getInputProps('businessType')}
                    onChange={handleBusinessTypeChange}
                  >
                    <Stack gap="xs">
                      <Radio.Card value="licensed_dealer" radius="md" p="md" withBorder>
                        <Group wrap="nowrap" align="flex-start">
                          <Radio.Indicator />
                          <Stack gap={4}>
                            <Text fw={500}>עוסק מורשה</Text>
                            <Text size="sm" c="dimmed">
                              עסק יחיד או שותפות שגובה מע״מ. מחזור שנתי מעל ₪120,000
                            </Text>
                          </Stack>
                        </Group>
                      </Radio.Card>

                      <Radio.Card value="exempt_dealer" radius="md" p="md" withBorder>
                        <Group wrap="nowrap" align="flex-start">
                          <Radio.Indicator />
                          <Stack gap={4}>
                            <Text fw={500}>עוסק פטור</Text>
                            <Text size="sm" c="dimmed">
                              עצמאי שמחזורו מתחת ל-₪120,000. פטור מגביית מע״מ
                            </Text>
                          </Stack>
                        </Group>
                      </Radio.Card>

                      <Radio.Card value="limited_company" radius="md" p="md" withBorder>
                        <Group wrap="nowrap" align="flex-start">
                          <Radio.Indicator />
                          <Stack gap={4}>
                            <Text fw={500}>חברה בע״מ</Text>
                            <Text size="sm" c="dimmed">
                              חברה פרטית הרשומה ברשם החברות (ח.פ.)
                            </Text>
                          </Stack>
                        </Group>
                      </Radio.Card>
                    </Stack>
                  </Radio.Group>

                  <Anchor component="button" size="sm" onClick={() => setTypeModalOpen(true)}>
                    לא בטוח? קרא עוד
                  </Anchor>

                  <Button
                    size="lg"
                    fullWidth
                    disabled={!form.values.businessType}
                    onClick={goToStep1}
                  >
                    המשך
                  </Button>
                </Stack>
              )}

              {/* Step 1: Legal identity */}
              {step === 1 && (
                <Stack gap="md">
                  {form.values.businessType === 'exempt_dealer' && (
                    <Text size="sm" c="dimmed">
                      כעוסק פטור, שמך האישי הוא שם העסק שיופיע בחשבוניות.
                    </Text>
                  )}

                  <TextInput
                    label={getNameLabel()}
                    required
                    data-autofocus
                    {...form.getInputProps('name')}
                    disabled={isPending}
                  />

                  <TextInput
                    label={getRegistrationLabel()}
                    required
                    placeholder="123456789"
                    {...form.getInputProps('registrationNumber')}
                    onBlur={(e) => {
                      form.getInputProps('registrationNumber').onBlur(e);
                      handleRegistrationNumberBlur();
                    }}
                    disabled={isPending}
                  />

                  {form.values.businessType !== 'exempt_dealer' && (
                    <TextInput
                      label={getVatLabel(form.values.businessType)}
                      description={getVatDescription(form.values.businessType)}
                      required
                      placeholder="123456789"
                      rightSection={<InfoTooltip label={getVatTooltip(form.values.businessType)} />}
                      {...form.getInputProps('vatNumber')}
                      onChange={(e) => {
                        vatManuallyEdited.current = true;
                        form.getInputProps('vatNumber').onChange(e);
                      }}
                      disabled={isPending}
                    />
                  )}

                  <Group justify="space-between">
                    <Button variant="default" onClick={() => setStep(0)}>
                      חזרה
                    </Button>
                    <Button onClick={goToStep2}>המשך</Button>
                  </Group>
                </Stack>
              )}

              {/* Step 2: Address and contact */}
              {step === 2 && (
                <form onSubmit={onSubmit}>
                  <Stack gap="xl">
                    <AddressAutocomplete form={form} disabled={isPending} />

                    <Stack gap="md">
                      <Text fw={600} size="lg">
                        פרטי קשר
                      </Text>

                      <TextInput
                        label="מספר טלפון"
                        placeholder="0501234567"
                        {...form.getInputProps('phone')}
                        disabled={isPending}
                      />

                      <TextInput
                        label='דוא"ל'
                        type="email"
                        placeholder="info@example.com"
                        {...form.getInputProps('email')}
                        disabled={isPending}
                      />
                    </Stack>

                    <Stack gap="xs">
                      <Anchor
                        component="button"
                        size="sm"
                        type="button"
                        onClick={() => setAdvancedOpen((o) => !o)}
                      >
                        {advancedOpen ? 'הגדרות מתקדמות ▴' : 'הגדרות מתקדמות ▾'}
                      </Anchor>
                      <Collapse in={advancedOpen}>
                        <Stack gap="md" pt="xs">
                          <TextInput
                            label="קידומת מספר חשבונית"
                            placeholder="INV"
                            rightSection={
                              <InfoTooltip label="קידומת שתופיע לפני מספר החשבונית, לדוגמה: INV-0001 או חש-0001. ניתן להשאיר ריק" />
                            }
                            {...form.getInputProps('invoiceNumberPrefix')}
                            disabled={isPending}
                          />

                          <NumberInput
                            label="מספר חשבונית ראשונה"
                            min={1}
                            allowNegative={false}
                            allowDecimal={false}
                            rightSection={
                              <InfoTooltip label="בדרך כלל 1, אלא אם אתם עוברים ממערכת אחרת ורוצים להמשיך מהמספר האחרון" />
                            }
                            {...form.getInputProps('startingInvoiceNumber')}
                            disabled={isPending}
                          />
                        </Stack>
                      </Collapse>
                    </Stack>

                    <Group justify="space-between">
                      <Button variant="default" type="button" onClick={() => setStep(1)}>
                        חזרה
                      </Button>
                      <Button type="submit" size="lg" loading={isPending}>
                        צור עסק והתחל להנפיק חשבוניות
                      </Button>
                    </Group>
                  </Stack>
                </form>
              )}
            </Stack>
          </Paper>
        </Stack>
      </Container>

      <Modal
        opened={typeModalOpen}
        onClose={() => setTypeModalOpen(false)}
        title="סוגי עסקים בישראל"
        centered
      >
        <Stack gap="md">
          <Stack gap={4}>
            <Text fw={600}>עוסק מורשה</Text>
            <Text size="sm" c="dimmed">
              עצמאי או שותפות עם מחזור שנתי מעל ₪120,000. חייב לגבות מע״מ מלקוחותיו ולהעביר לרשות
              המיסים. מקבל מספר עוסק מורשה (ע.מ.) מרשות המיסים.
            </Text>
          </Stack>
          <Stack gap={4}>
            <Text fw={600}>עוסק פטור</Text>
            <Text size="sm" c="dimmed">
              עצמאי עם מחזור שנתי מתחת ל-₪120,000. פטור מגביית מע״מ ואינו מנפיק חשבוניות מס. מזדהה
              באמצעות תעודת זהות.
            </Text>
          </Stack>
          <Stack gap={4}>
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
