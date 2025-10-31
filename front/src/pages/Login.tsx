import { Button, Card, Center, Group, Stack, Text, Title } from '@mantine/core';
import { Navigate } from 'react-router-dom';
import { IconBrandGoogleFilled } from '@tabler/icons-react';
import { useAuth } from '../auth/AuthContext';

export function Login() {
  const { loginWithGoogle, user } = useAuth();

  if (user) return <Navigate to="/" replace />;

  return (
    <Center style={{ minHeight: 'calc(100dvh - 56px)' }}>
      <Card shadow="sm" padding="lg" radius="md" withBorder w={360}>
        <Stack>
          <Title order={4} ta="center">
            bon starter
          </Title>
          <Text ta="center" c="dimmed">
            Sign in with Google to continue.
          </Text>
          <Group justify="center" mt="md">
            <Button
              leftSection={<IconBrandGoogleFilled size={18} />}
              onClick={loginWithGoogle}
              variant="filled"
            >
              Continue with Google
            </Button>
          </Group>
        </Stack>
      </Card>
    </Center>
  );
}
