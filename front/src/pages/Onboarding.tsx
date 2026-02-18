import { useRef } from 'react';
import {
  ActionIcon,
  Button,
  Center,
  Container,
  Divider,
  Group,
  Input,
  NumberInput,
  Paper,
  Radio,
  Stack,
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

function getVatLabel(businessType: BusinessType) {
  switch (businessType) {
    case 'licensed_dealer':
      return 'מספר עוסק מורשה (ע.מ.)';
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

function InfoTooltip({ label }: { label: string }) {
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

  const form = useForm<CreateBusinessBody>({
    initialValues: {
      name: '',
      businessType: 'licensed_dealer',
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
      name: (value) => (!value.trim() ? 'שם העסק נדרש' : null),
      registrationNumber: (value) => {
        if (!value.trim()) return 'מספר רישום נדרש';
        if (!/^\d{9}$/.test(value)) return 'מספר רישום חייב להיות 9 ספרות';
        return null;
      },
      vatNumber: (value, values) => {
        if (values.businessType !== 'exempt_dealer') {
          if (!value) return 'מספר מע"מ נדרש';
          if (!/^\d{9}$/.test(value)) return 'מספר מע"מ חייב להיות 9 ספרות';
        }
        return null;
      },
      streetAddress: (value) => (!value.trim() ? 'כתובת רחוב נדרשת' : null),
      city: (value) => (!value.trim() ? 'עיר נדרשת' : null),
      postalCode: (value) => {
        if (value && !/^\d{7}$/.test(value)) return 'מיקוד חייב להיות 7 ספרות';
        return null;
      },
      phone: (value) => {
        if (value && !/^0[2-9]\d{7,8}$/.test(value)) return 'מספר טלפון לא תקין';
        return null;
      },
      email: (value) => {
        if (value && !/^[^\s@.]+@[^\s@.]+\.[^\s@.]+$/.test(value)) return 'כתובת אימייל לא תקינה';
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
  });

  const onSubmit = form.onSubmit((values) => {
    const payload: CreateBusinessBody = {
      ...values,
      vatNumber: values.vatNumber || undefined,
      postalCode: values.postalCode || undefined,
      phone: values.phone || undefined,
      email: values.email || undefined,
      invoiceNumberPrefix: values.invoiceNumberPrefix || undefined,
    };
    createMutation.mutate(payload);
  });

  const isPending = createMutation.isPending;
  const isExempt = form.values.businessType === 'exempt_dealer';
  const vatManuallyEdited = useRef(false);

  const handleRegistrationNumberBlur = () => {
    const regNum = form.values.registrationNumber;
    if (/^\d{9}$/.test(regNum) && !isExempt && !vatManuallyEdited.current) {
      form.setFieldValue('vatNumber', regNum);
    }
  };

  const handleBusinessTypeChange = (value: string) => {
    form.setFieldValue('businessType', value as BusinessType);
    vatManuallyEdited.current = false;
    if (value === 'exempt_dealer') {
      form.setFieldValue('vatNumber', undefined);
    } else {
      const regNum = form.values.registrationNumber;
      if (/^\d{9}$/.test(regNum)) {
        form.setFieldValue('vatNumber', regNum);
      }
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
            <Text size="sm" ta="center" c="dimmed">
              מלאו את הפרטים הבאים כדי להתחיל להנפיק חשבוניות
            </Text>
          </Stack>

          <Paper component="form" onSubmit={onSubmit} shadow="md" radius="lg" p="xl" withBorder>
            <Stack gap="xl">
              {/* Business Details */}
              <Stack gap="md">
                <Text fw={600} size="lg">
                  פרטי העסק
                </Text>

                <TextInput
                  label="שם העסק"
                  description="שם העסק כפי שיופיע בחשבוניות"
                  required
                  data-autofocus
                  rightSection={
                    <InfoTooltip label="זהו השם המלא של העסק שלך כפי שהוא רשום ברשות המיסים ויופיע בכל חשבונית שתנפיק" />
                  }
                  {...form.getInputProps('name')}
                  disabled={isPending}
                />

                <Stack gap="xs">
                  <Input.Label required>סוג עסק</Input.Label>
                  <Input.Description>בחרו את סוג העסק המתאים למבנה העסקי שלכם</Input.Description>
                  <Radio.Group
                    {...form.getInputProps('businessType')}
                    onChange={handleBusinessTypeChange}
                  >
                    <Stack gap="xs" mt="xs">
                      <Radio.Card value="licensed_dealer" radius="md" p="md" withBorder>
                        <Group wrap="nowrap" align="flex-start">
                          <Radio.Indicator />
                          <Stack gap={4}>
                            <Text fw={500}>עוסק מורשה</Text>
                            <Text size="sm" c="dimmed">
                              עסק הגובה מע״מ מלקוחותיו ומעביר לרשות המיסים
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
                              עסק שפטור מגביית מע״מ עד תקרת מחזור מסוימת
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
                              חברה פרטית מוגבלת הרשומה ברשם החברות
                            </Text>
                          </Stack>
                        </Group>
                      </Radio.Card>
                    </Stack>
                  </Radio.Group>
                </Stack>

                <TextInput
                  label="מספר רישום"
                  description="9 ספרות - ח.פ. או ע.מ."
                  required
                  placeholder="123456789"
                  rightSection={
                    <InfoTooltip label="מספר ח.פ. (חברה פרטית) או מספר עוסק מורשה בן 9 ספרות כפי שמופיע ברישיון העסק ובמסמכי רשות המיסים" />
                  }
                  {...form.getInputProps('registrationNumber')}
                  onBlur={(e) => {
                    form.getInputProps('registrationNumber').onBlur(e);
                    handleRegistrationNumberBlur();
                  }}
                  disabled={isPending}
                />

                <TextInput
                  label={getVatLabel(form.values.businessType)}
                  description={getVatDescription(form.values.businessType)}
                  required={!isExempt}
                  placeholder={isExempt ? '' : '123456789'}
                  rightSection={<InfoTooltip label={getVatTooltip(form.values.businessType)} />}
                  {...form.getInputProps('vatNumber')}
                  onChange={(e) => {
                    vatManuallyEdited.current = true;
                    form.getInputProps('vatNumber').onChange(e);
                  }}
                  disabled={isPending || isExempt}
                />
              </Stack>

              <Divider />

              {/* Address */}
              <Stack gap="md">
                <Text fw={600} size="lg">
                  כתובת
                </Text>

                <TextInput
                  label="רחוב ומספר"
                  description="כתובת העסק כפי שתופיע בחשבוניות"
                  required
                  {...form.getInputProps('streetAddress')}
                  disabled={isPending}
                />

                <Group grow>
                  <TextInput
                    label="עיר"
                    description="שם העיר או הישוב"
                    required
                    {...form.getInputProps('city')}
                    disabled={isPending}
                  />
                  <TextInput
                    label="מיקוד"
                    description="7 ספרות (אופציונלי)"
                    placeholder="1234567"
                    {...form.getInputProps('postalCode')}
                    disabled={isPending}
                  />
                </Group>
              </Stack>

              <Divider />

              {/* Contact */}
              <Stack gap="md">
                <Text fw={600} size="lg">
                  פרטי קשר
                </Text>

                <TextInput
                  label="טלפון"
                  description="מספר טלפון שיופיע בחשבוניות"
                  placeholder="0501234567"
                  {...form.getInputProps('phone')}
                  disabled={isPending}
                />

                <TextInput
                  label='דוא"ל'
                  description="כתובת אימייל לקבלת התראות ושליחת חשבוניות"
                  type="email"
                  placeholder="info@example.com"
                  {...form.getInputProps('email')}
                  disabled={isPending}
                />
              </Stack>

              <Divider />

              {/* Invoice Settings */}
              <Stack gap="md">
                <Text fw={600} size="lg">
                  הגדרות חשבוניות
                </Text>

                <TextInput
                  label="קידומת מספר חשבונית"
                  description="אופציונלי - טקסט שיופיע לפני מספר החשבונית"
                  placeholder="INV"
                  rightSection={
                    <InfoTooltip label="קידומת שתופיע לפני מספר החשבונית, לדוגמה: INV-0001 או חש-0001. ניתן להשאיר ריק" />
                  }
                  {...form.getInputProps('invoiceNumberPrefix')}
                  disabled={isPending}
                />

                <NumberInput
                  label="מספר חשבונית התחלתי"
                  description="המספר ממנו יתחילו החשבוניות שלך"
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

              <Button type="submit" size="lg" fullWidth mt="md" loading={isPending}>
                צור עסק והתחל להנפיק חשבוניות
              </Button>
            </Stack>
          </Paper>
        </Stack>
      </Container>
    </Center>
  );
}
