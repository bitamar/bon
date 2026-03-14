import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Container,
  Group,
  Stack,
  Switch,
  Text,
  TextInput,
  useMantineColorScheme,
} from '@mantine/core';
import { IconMoon, IconSun } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSettings, updateSettings } from '../auth/api';
import { FormSkeleton } from '../components/FormSkeleton';
import { StatusCard } from '../components/StatusCard';
import { queryKeys } from '../lib/queryKeys';
import type { SettingsResponse } from '@bon/types/users';
import { extractErrorMessage } from '../lib/notifications';
import { useApiMutation } from '../lib/useApiMutation';
import { PageTitle } from '../components/PageTitle';
import { useBusiness } from '../contexts/BusinessContext';
import { BusinessSettingsSection } from './BusinessSettings';

export function Settings() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const queryClient = useQueryClient();
  const { activeBusiness } = useBusiness();

  const settingsQuery = useQuery({
    queryKey: queryKeys.settings(),
    queryFn: ({ signal }: { signal: AbortSignal }) => getSettings({ signal }),
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setName(settingsQuery.data.user.name ?? '');
      setPhone(settingsQuery.data.user.phone ?? '');
    }
  }, [settingsQuery.data]);

  const updateSettingsMutation = useApiMutation({
    mutationFn: updateSettings,
    successToast: { message: 'ההגדרות נשמרו בהצלחה' },
    errorToast: { fallbackMessage: 'לא הצלחנו לשמור את ההגדרות, נסו שוב' },
    onSuccess: (data: SettingsResponse) => {
      queryClient.setQueryData(queryKeys.settings(), data);
      queryClient.invalidateQueries({ queryKey: queryKeys.me() });
    },
  });

  if (settingsQuery.isPending) {
    return (
      <Container size="sm" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <Stack gap="md">
          <PageTitle order={3}>הגדרות</PageTitle>
          <FormSkeleton rows={3} />
        </Stack>
      </Container>
    );
  }

  if (settingsQuery.error) {
    const message = extractErrorMessage(settingsQuery.error, 'לא הצלחנו לטעון את ההגדרות');
    return (
      <Container size="sm" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <Stack gap="md">
          <StatusCard
            status="error"
            title="לא הצלחנו לטעון את ההגדרות"
            description={message}
            align="start"
            primaryAction={{
              label: 'נסה שוב',
              onClick: () => {
                settingsQuery.refetch();
              },
              loading: settingsQuery.isFetching,
            }}
          />
        </Stack>
      </Container>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettingsMutation.mutateAsync({
      name: name.trim() ? name.trim() : null,
      phone: phone.trim() ? phone.trim() : null,
    });
  };

  return (
    <Container size="sm" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
      <Stack gap="md">
        <PageTitle order={3}>הגדרות</PageTitle>
        <Card component="form" onSubmit={onSubmit} noValidate withBorder radius="lg" p="lg">
          <Stack gap="md">
            <Text size="lg" fw={600}>
              פרופיל
            </Text>
            <Switch
              checked={colorScheme === 'dark'}
              onChange={({ currentTarget }) =>
                setColorScheme(currentTarget.checked ? 'dark' : 'light')
              }
              onLabel={<IconMoon size={14} />}
              offLabel={<IconSun size={14} />}
            />
            <TextInput
              label="שם"
              required
              value={name}
              onChange={({ currentTarget }) => setName(currentTarget.value)}
            />
            <TextInput
              label="טלפון"
              value={phone}
              onChange={({ currentTarget }) => setPhone(currentTarget.value)}
            />
            <Group justify="flex-end">
              <Button type="submit" loading={updateSettingsMutation.isPending}>
                שמור שינויים
              </Button>
            </Group>
          </Stack>
        </Card>

        {activeBusiness?.role === 'owner' && <BusinessSettingsSection />}
      </Stack>
    </Container>
  );
}
