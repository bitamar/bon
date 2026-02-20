import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Container,
  Group,
  Stack,
  Switch,
  TextInput,
  useMantineColorScheme,
} from '@mantine/core';
import { IconMoon, IconSun } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSettings, updateSettings } from '../auth/api';
import { StatusCard } from '../components/StatusCard';
import { queryKeys } from '../lib/queryKeys';
import type { SettingsResponse } from '@bon/types/users';
import { extractErrorMessage } from '../lib/notifications';
import { useApiMutation } from '../lib/useApiMutation';
import { PageTitle } from '../components/PageTitle';

export function Settings() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const queryClient = useQueryClient();

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
    successToast: { message: 'Settings saved' },
    errorToast: { fallbackMessage: 'Saving settings failed' },
    onSuccess: (data: SettingsResponse) => {
      queryClient.setQueryData(queryKeys.settings(), data);
      queryClient.invalidateQueries({ queryKey: queryKeys.me() });
    },
  });

  if (settingsQuery.isPending) {
    return (
      <Stack gap="md">
        <StatusCard status="loading" title="Loading settings…" align="start" />
      </Stack>
    );
  }

  if (settingsQuery.error) {
    const message = extractErrorMessage(
      settingsQuery.error,
      'Something went wrong while fetching settings'
    );
    return (
      <Stack gap="md">
        <StatusCard
          status="error"
          title="Unable to load settings"
          description={message}
          align="start"
          primaryAction={{
            label: 'Try again',
            onClick: () => {
              settingsQuery.refetch();
            },
            loading: settingsQuery.isFetching,
          }}
        />
      </Stack>
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
        <PageTitle order={3}>Profile settings</PageTitle>
        <Card component="form" onSubmit={onSubmit} withBorder radius="lg" p="lg">
          <Stack gap="md">
            <Switch
              checked={colorScheme === 'dark'}
              onChange={({ currentTarget }) =>
                setColorScheme(currentTarget.checked ? 'dark' : 'light')
              }
              onLabel={<IconMoon size={14} />}
              offLabel={<IconSun size={14} />}
            />
            <TextInput
              label="Name"
              required
              value={name}
              onChange={({ currentTarget }) => setName(currentTarget.value)}
            />
            <TextInput
              label="Phone"
              value={phone}
              onChange={({ currentTarget }) => setPhone(currentTarget.value)}
            />
            <Group justify="flex-end">
              <Button type="submit" loading={updateSettingsMutation.isPending}>
                Save changes
              </Button>
            </Group>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
