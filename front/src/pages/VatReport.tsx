import { useState } from 'react';
import { Alert, Button, Container, Group, Stack, Text } from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { IconDownload, IconFileSpreadsheet } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useParams } from 'react-router-dom';
import { PageTitle } from '../components/PageTitle';
import { useBusiness } from '../contexts/BusinessContext';
import { downloadPcn874 } from '../api/reports';
import { HttpError } from '../lib/http';

function getPreviousMonthStr(): string {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const y = prev.getFullYear();
  const m = String(prev.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

export function VatReport() {
  const { businessId = '' } = useParams<{ businessId: string }>();
  const { activeBusiness } = useBusiness();
  const [selectedMonth, setSelectedMonth] = useState<string | null>(getPreviousMonthStr());
  const [isDownloading, setIsDownloading] = useState(false);

  const isExempt = activeBusiness?.businessType === 'exempt_dealer';

  async function handleDownload() {
    if (!selectedMonth || !businessId) return;

    setIsDownloading(true);
    try {
      const date = new Date(selectedMonth);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      await downloadPcn874(businessId, year, month);
      notifications.show({
        title: 'הקובץ הורד בהצלחה',
        message: `דוח PCN874 לתקופה ${String(month).padStart(2, '0')}/${year}`,
        color: 'green',
      });
    } catch (err) {
      const message = err instanceof HttpError ? err.message : 'שגיאה בהורדת הדוח';
      notifications.show({
        title: 'שגיאה',
        message,
        color: 'red',
      });
    } finally {
      setIsDownloading(false);
    }
  }

  if (isExempt) {
    return (
      <Container size="sm" mt="xl">
        <Stack gap="lg">
          <PageTitle order={3}>דוח מע&quot;מ מפורט (PCN874)</PageTitle>
          <Alert color="yellow" title="לא רלוונטי">
            עסק פטור אינו מדווח מע&quot;מ ואינו נדרש להגיש דוח PCN874.
          </Alert>
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="sm" mt="xl">
      <Stack gap="lg">
        <PageTitle order={3}>דוח מע&quot;מ מפורט (PCN874)</PageTitle>

        <Text size="sm" c="dimmed">
          הורד את קובץ הדיווח המפורט למע&quot;מ בפורמט PCN874. הקובץ כולל את כל החשבוניות שהופקו
          בתקופה הנבחרת.
        </Text>

        <Group align="end" gap="md">
          <MonthPickerInput
            label="תקופת דיווח"
            placeholder="בחר חודש"
            value={selectedMonth}
            onChange={setSelectedMonth}
            maxDate={new Date()}
            style={{ flex: 1, maxWidth: 240 }}
            leftSection={<IconFileSpreadsheet size={16} />}
          />

          <Button
            leftSection={<IconDownload size={16} />}
            onClick={handleDownload}
            loading={isDownloading}
            disabled={!selectedMonth}
          >
            הורד דוח מע&quot;מ
          </Button>
        </Group>
      </Stack>
    </Container>
  );
}
