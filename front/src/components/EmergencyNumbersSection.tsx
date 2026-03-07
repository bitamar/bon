import { useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  Progress,
  Stack,
  Table,
  Text,
  Textarea,
} from '@mantine/core';
import { IconAlertTriangle, IconTrash } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchEmergencyNumbers,
  addEmergencyNumbers,
  deleteEmergencyNumber,
} from '../api/emergency-numbers';
import { queryKeys } from '../lib/queryKeys';
import { useApiMutation } from '../lib/useApiMutation';
import { FormSkeleton } from './FormSkeleton';
import { StatusCard } from './StatusCard';
import { extractErrorMessage } from '../lib/notifications';
import { EMERGENCY_POOL_LOW_THRESHOLD } from '@bon/types/shaam';
import type { EmergencyNumber } from '@bon/types/shaam';

function formatDate(isoString: string | null): string {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function statusBadge(num: Readonly<EmergencyNumber>) {
  if (num.reported)
    return (
      <Badge color="gray" variant="light" size="sm">
        דווח
      </Badge>
    );
  if (num.used)
    return (
      <Badge color="orange" variant="light" size="sm">
        בשימוש
      </Badge>
    );
  return (
    <Badge color="green" variant="light" size="sm">
      זמין
    </Badge>
  );
}

export function EmergencyNumbersSection(props: Readonly<{ businessId: string }>) {
  const { businessId } = props;
  const queryClient = useQueryClient();
  const [numbersInput, setNumbersInput] = useState('');

  const numbersQuery = useQuery({
    queryKey: queryKeys.emergencyNumbers(businessId),
    queryFn: () => fetchEmergencyNumbers(businessId),
    enabled: !!businessId,
  });

  const addMutation = useApiMutation({
    mutationFn: (data: { numbers: string[] }) => addEmergencyNumbers(businessId, data),
    successToast: { message: 'מספרי חירום נוספו בהצלחה' },
    errorToast: { fallbackMessage: 'לא הצלחנו להוסיף מספרי חירום' },
    onSuccess: () => {
      setNumbersInput('');
      queryClient.invalidateQueries({ queryKey: queryKeys.emergencyNumbers(businessId) });
    },
  });

  const deleteMutation = useApiMutation({
    mutationFn: (id: string) => deleteEmergencyNumber(businessId, id),
    successToast: { message: 'מספר חירום הוסר' },
    errorToast: { fallbackMessage: 'לא הצלחנו להסיר את המספר' },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.emergencyNumbers(businessId) });
    },
  });

  const handleAdd = () => {
    const numbers = numbersInput
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (numbers.length === 0) return;
    addMutation.mutate({ numbers });
  };

  if (numbersQuery.isPending) {
    return <FormSkeleton rows={3} />;
  }

  if (numbersQuery.error) {
    const message = extractErrorMessage(numbersQuery.error, 'לא הצלחנו לטעון מספרי חירום');
    return (
      <StatusCard
        status="error"
        title="לא הצלחנו לטעון מספרי חירום"
        description={message}
        primaryAction={{
          label: 'נסה שוב',
          onClick: () => numbersQuery.refetch(),
          loading: numbersQuery.isFetching,
        }}
      />
    );
  }

  const { numbers, availableCount, usedCount } = numbersQuery.data;
  const totalCount = availableCount + usedCount;
  const poolLow = availableCount > 0 && availableCount < EMERGENCY_POOL_LOW_THRESHOLD;
  const poolEmpty = availableCount === 0 && totalCount > 0;
  const progressPercent = totalCount > 0 ? (availableCount / totalCount) * 100 : 0;

  return (
    <Stack gap="md">
      {/* Pool status */}
      <Group justify="space-between" align="center">
        <Text size="sm" c="dimmed">
          {availableCount} מספרים זמינים, {usedCount} נוצלו
        </Text>
      </Group>

      {totalCount > 0 && (
        <Progress
          value={progressPercent}
          color={poolLow || poolEmpty ? 'red' : 'green'}
          size="sm"
        />
      )}

      {poolLow && (
        <Alert
          color="orange"
          icon={<IconAlertTriangle size={16} />}
          title="מאגר מספרי החירום עומד להסתיים"
        >
          יש להזין מספרים חדשים
        </Alert>
      )}

      {poolEmpty && (
        <Alert color="red" icon={<IconAlertTriangle size={16} />} title="מאגר מספרי החירום ריק">
          כל מספרי החירום נוצלו — יש להזין מספרים חדשים
        </Alert>
      )}

      {/* Add numbers */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Text size="sm" fw={500}>
            הזנת מספרי חירום חדשים
          </Text>
          <Textarea
            placeholder="הזן מספר חירום בכל שורה"
            value={numbersInput}
            onChange={(e) => setNumbersInput(e.currentTarget.value)}
            minRows={3}
            maxRows={6}
            autosize
          />
          <Group justify="flex-end">
            <Button
              size="sm"
              onClick={handleAdd}
              loading={addMutation.isPending}
              disabled={!numbersInput.trim()}
            >
              הוסף מספרים
            </Button>
          </Group>
        </Stack>
      </Paper>

      {/* Numbers table */}
      {numbers.length > 0 && (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>מספר</Table.Th>
              <Table.Th>סטטוס</Table.Th>
              <Table.Th>שימוש</Table.Th>
              <Table.Th>דיווח</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {numbers.map((num) => (
              <Table.Tr key={num.id}>
                <Table.Td dir="ltr">{num.number}</Table.Td>
                <Table.Td>{statusBadge(num)}</Table.Td>
                <Table.Td>{formatDate(num.usedAt)}</Table.Td>
                <Table.Td>{formatDate(num.reportedAt)}</Table.Td>
                <Table.Td>
                  {!num.used && (
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="sm"
                      onClick={() => deleteMutation.mutate(num.id)}
                      loading={deleteMutation.isPending}
                      title="הסר מספר"
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      {numbers.length === 0 && (
        <Text size="sm" c="dimmed" ta="center">
          לא הוזנו מספרי חירום עדיין
        </Text>
      )}
    </Stack>
  );
}
