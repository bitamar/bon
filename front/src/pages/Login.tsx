import { Button, Center, Paper, Stack } from '@mantine/core';
import { Navigate } from 'react-router-dom';
import { IconBrandGoogleFilled } from '@tabler/icons-react';
import { useAuth } from '../auth/AuthContext';
import { BrandLogo } from '../components/BrandLogo';

export function Login() {
  const { loginWithGoogle, user } = useAuth();

  if (user) return <Navigate to="/" replace />;

  return (
    <Center
      style={{
        minHeight: '100dvh',
        background: 'linear-gradient(150deg, #fffbf5 0%, #ecf5e0 100%)',
      }}
    >
      <Stack align="center" gap="xl">
        <BrandLogo subtitle="חשבוניות בקלות" />

        <Paper
          shadow="xs"
          p="xl"
          radius="xl"
          w={340}
          style={{ border: '1px solid var(--mantine-color-lime-2)' }}
        >
          <Stack gap="lg">
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
