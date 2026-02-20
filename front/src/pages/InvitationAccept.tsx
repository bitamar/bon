import { Button, Card, Center, Group, Stack, Text } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApiMutation } from '../lib/useApiMutation';
import { acceptInvitation, declineInvitation } from '../api/invitations';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';

export function InvitationAccept() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = searchParams.get('token');

  const acceptMutation = useApiMutation({
    mutationFn: acceptInvitation,
    successToast: { message: 'ההזמנה התקבלה בהצלחה' },
    errorToast: { fallbackMessage: 'לא הצלחנו לקבל את ההזמנה, נסו שוב' },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.userBusinesses() });
      queryClient.invalidateQueries({ queryKey: queryKeys.myInvitations() });
      navigate('/');
    },
  });

  const declineMutation = useApiMutation({
    mutationFn: declineInvitation,
    successToast: { message: 'ההזמנה נדחתה' },
    errorToast: { fallbackMessage: 'לא הצלחנו לדחות את ההזמנה, נסו שוב' },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.myInvitations() });
      navigate('/businesses');
    },
  });

  if (!token) {
    return (
      <Center style={{ minHeight: 'calc(100dvh - 64px)' }}>
        <Card shadow="sm" padding="lg" radius="md" withBorder w={400}>
          <Stack>
            <Text ta="center" fw={600}>
              הזמנה לא תקינה
            </Text>
            <Text ta="center" c="dimmed">
              קישור ההזמנה אינו תקין או פג תוקפו.
            </Text>
            <Button onClick={() => navigate('/')}>חזור לדף הבית</Button>
          </Stack>
        </Card>
      </Center>
    );
  }

  return (
    <Center style={{ minHeight: 'calc(100dvh - 64px)' }}>
      <Card shadow="sm" padding="lg" radius="md" withBorder w={400}>
        <Stack>
          <Text ta="center" fw={600}>
            הזמנה לצוות
          </Text>
          <Text ta="center" c="dimmed">
            קיבלת הזמנה להצטרף לעסק. האם תרצה לקבל את ההזמנה?
          </Text>
          <Group justify="center" grow>
            <Button
              variant="subtle"
              color="red"
              leftSection={<IconX size={18} />}
              onClick={() => declineMutation.mutate(token)}
              loading={declineMutation.isPending}
              disabled={acceptMutation.isPending}
            >
              דחה
            </Button>
            <Button
              leftSection={<IconCheck size={18} />}
              onClick={() => acceptMutation.mutate(token)}
              loading={acceptMutation.isPending}
              disabled={declineMutation.isPending}
            >
              קבל
            </Button>
          </Group>
        </Stack>
      </Card>
    </Center>
  );
}
