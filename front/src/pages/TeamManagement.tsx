import { useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Container,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { IconTrash, IconUserPlus } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageTitle } from '../components/PageTitle';
import { StatusCard } from '../components/StatusCard';
import { useApiMutation } from '../lib/useApiMutation';
import { fetchTeamMembers, removeTeamMember } from '../api/businesses';
import { createInvitation } from '../api/invitations';
import { queryKeys } from '../lib/queryKeys';
import { useBusiness } from '../contexts/BusinessContext';
import { extractErrorMessage } from '../lib/notifications';
import type { CreateInvitationBody } from '@bon/types/invitations';

const ROLE_COLORS: Record<string, string> = {
  owner: 'violet',
  admin: 'blue',
  user: 'gray',
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'בעלים',
  admin: 'מנהל',
  user: 'משתמש',
};

export function TeamManagement() {
  const queryClient = useQueryClient();
  const { activeBusiness } = useBusiness();
  const [inviteOpened, { open: openInvite, close: closeInvite }] = useDisclosure(false);
  const [deleteOpened, { open: openDelete, close: closeDelete }] = useDisclosure(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const teamQuery = useQuery({
    queryKey: queryKeys.teamMembers(activeBusiness?.id ?? ''),
    queryFn: () => fetchTeamMembers(activeBusiness!.id),
    enabled: !!activeBusiness,
  });

  const inviteForm = useForm<CreateInvitationBody>({
    initialValues: {
      email: '',
      role: 'user',
      personalMessage: undefined,
    },
    validate: {
      email: (value) => {
        if (!value) return 'כתובת אימייל נדרשת';
        if (!/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(value)) return 'כתובת אימייל לא תקינה';
        return null;
      },
    },
  });

  const inviteMutation = useApiMutation({
    mutationFn: ({ businessId, data }: { businessId: string; data: CreateInvitationBody }) =>
      createInvitation(businessId, data),
    successToast: { message: 'ההזמנה נשלחה בהצלחה' },
    errorToast: { fallbackMessage: 'שגיאה בשליחת ההזמנה' },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invitations(activeBusiness!.id) });
      closeInvite();
      inviteForm.reset();
    },
  });

  const removeMutation = useApiMutation({
    mutationFn: ({ businessId, userId }: { businessId: string; userId: string }) =>
      removeTeamMember(businessId, userId),
    successToast: { message: 'המשתמש הוסר בהצלחה' },
    errorToast: { fallbackMessage: 'שגיאה בהסרת המשתמש' },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMembers(activeBusiness!.id) });
      closeDelete();
      setSelectedUserId(null);
    },
  });

  if (!activeBusiness) {
    return (
      <Container size="lg" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <StatusCard status="error" title="לא נבחר עסק" description="אנא בחר עסק מהתפריט העליון" />
      </Container>
    );
  }

  if (teamQuery.isPending) {
    return (
      <Container size="lg" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <StatusCard status="loading" title="טוען צוות..." />
      </Container>
    );
  }

  if (teamQuery.error) {
    const message = extractErrorMessage(teamQuery.error, 'שגיאה בטעינת נתוני הצוות');
    return (
      <Container size="lg" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <StatusCard
          status="error"
          title="שגיאה בטעינת נתוני הצוות"
          description={message}
          primaryAction={{
            label: 'נסה שוב',
            onClick: () => teamQuery.refetch(),
          }}
        />
      </Container>
    );
  }

  const team = teamQuery.data.team;
  const selectedMember = team.find((m) => m.userId === selectedUserId);

  const onInviteSubmit = inviteForm.onSubmit((values) => {
    inviteMutation.mutate({
      businessId: activeBusiness.id,
      data: {
        ...values,
        personalMessage: values.personalMessage || undefined,
      },
    });
  });

  return (
    <>
      <Container size="lg" pt={{ base: 'xl', sm: 'xl' }} pb="xl">
        <Stack gap="md">
          <Group justify="space-between">
            <PageTitle order={3}>צוות</PageTitle>
            <Button leftSection={<IconUserPlus size={18} />} onClick={openInvite}>
              הזמן משתמש
            </Button>
          </Group>

          {team.length === 0 ? (
            <StatusCard
              status="empty"
              title="אין חברי צוות"
              description="הזמן משתמשים לצוות כדי לשתף פעולה"
              primaryAction={{
                label: 'הזמן משתמש',
                onClick: openInvite,
              }}
            />
          ) : (
            <Paper withBorder radius="lg">
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>שם</Table.Th>
                    <Table.Th>אימייל</Table.Th>
                    <Table.Th>תפקיד</Table.Th>
                    <Table.Th>פעולות</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {team.map((member) => (
                    <Table.Tr key={member.userId}>
                      <Table.Td>
                        <Group gap="sm">
                          <Avatar size={32} radius="xl" src={member.avatarUrl ?? null} />
                          <Text size="sm">{member.name || 'ללא שם'}</Text>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{member.email}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={ROLE_COLORS[member.role] as string}>
                          {ROLE_LABELS[member.role]}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        {member.role !== 'owner' && (
                          <Button
                            size="xs"
                            variant="subtle"
                            color="red"
                            leftSection={<IconTrash size={14} />}
                            onClick={() => {
                              setSelectedUserId(member.userId);
                              openDelete();
                            }}
                          >
                            הסר
                          </Button>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          )}
        </Stack>
      </Container>

      <Modal
        opened={inviteOpened}
        onClose={closeInvite}
        title="הזמן משתמש"
        centered
        overlayProps={{ blur: 2 }}
      >
        <form onSubmit={onInviteSubmit}>
          <Stack gap="md">
            <TextInput
              label="אימייל"
              type="email"
              required
              placeholder="user@example.com"
              {...inviteForm.getInputProps('email')}
              disabled={inviteMutation.isPending}
            />

            <Select
              label="תפקיד"
              required
              data={[
                { value: 'admin', label: 'מנהל' },
                { value: 'user', label: 'משתמש' },
              ]}
              {...inviteForm.getInputProps('role')}
              disabled={inviteMutation.isPending}
            />

            <TextInput
              label="הודעה אישית"
              placeholder="אופציונלי"
              {...inviteForm.getInputProps('personalMessage')}
              disabled={inviteMutation.isPending}
            />

            <Group justify="flex-end">
              <Button variant="subtle" onClick={closeInvite} disabled={inviteMutation.isPending}>
                ביטול
              </Button>
              <Button type="submit" loading={inviteMutation.isPending}>
                שלח הזמנה
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={deleteOpened}
        onClose={closeDelete}
        title="הסרת משתמש"
        centered
        overlayProps={{ blur: 2 }}
      >
        <Stack gap="md">
          <Text>
            האם אתה בטוח שברצונך להסיר את {selectedMember?.name || selectedMember?.email} מהצוות?
          </Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeDelete} disabled={removeMutation.isPending}>
              ביטול
            </Button>
            <Button
              color="red"
              leftSection={<IconTrash size={16} />}
              loading={removeMutation.isPending}
              onClick={() => {
                if (selectedUserId) {
                  removeMutation.mutate({ businessId: activeBusiness.id, userId: selectedUserId });
                }
              }}
            >
              הסר
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
