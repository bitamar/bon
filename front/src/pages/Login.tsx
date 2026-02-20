import { Button, Center, Paper, Stack, Text, Title } from '@mantine/core';
import { Navigate } from 'react-router-dom';
import { IconBrandGoogleFilled } from '@tabler/icons-react';
import { useAuth } from '../auth/AuthContext';

export function Login() {
  const { loginWithGoogle, user } = useAuth();

  if (user) return <Navigate to="/" replace />;

  return (
    <Center
      style={{
        minHeight: '100dvh',
        background: 'linear-gradient(150deg, #fffbf5 0%, #e4f0e8 100%)',
      }}
    >
      <Stack align="center" gap="xl">
        <Stack align="center" gap={6}>
          <Title
            order={1}
            style={{ fontSize: '3.5rem', letterSpacing: '-0.04em', fontWeight: 700 }}
            c="sage.6"
          >
            bon
          </Title>
          <Text size="lg" c="dimmed" fw={400}>
            הנפקת חשבוניות בקלות
          </Text>
        </Stack>

        <Paper
          shadow="xs"
          p="xl"
          radius="xl"
          w={340}
          style={{ border: '1px solid var(--mantine-color-sage-2)' }}
        >
          <Stack gap="lg">
            <Stack gap={4} align="center">
              <Text fw={500}>ברוכים הבאים</Text>
              <Text size="sm" c="dimmed" ta="center">
                המשיכו עם חשבון Google שלכם כדי להתחיל
              </Text>
            </Stack>

            <Button
              leftSection={<IconBrandGoogleFilled size={18} />}
              onClick={loginWithGoogle}
              variant="filled"
              size="md"
              fullWidth
              radius="lg"
            >
              כניסה עם Google
            </Button>
          </Stack>
        </Paper>
      </Stack>
    </Center>
  );
}
