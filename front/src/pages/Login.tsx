import { Button, Center, Paper, Stack, Text, Title } from '@mantine/core';
import { Navigate } from 'react-router-dom';
import { IconBrandGoogleFilled } from '@tabler/icons-react';
import { useAuth } from '../auth/AuthContext';
import { AnimatedBackground } from '../components/AnimatedBackground';

export function Login() {
  const { loginWithGoogle, user } = useAuth();

  if (user) return <Navigate to="/" replace />;

  return (
    <AnimatedBackground>
      <Center style={{ minHeight: '100dvh' }} px="md">
        <Stack align="center" gap="xl" w={{ base: '100%', xs: 'auto' }}>
          <Stack align="center" gap={0}>
            <Title
              order={1}
              style={{
                fontSize: '4rem',
                letterSpacing: '-0.04em',
                fontWeight: 1000,
                textShadow: '0 0 8px rgba(255, 255, 255, 0.4), 0 0 20px rgba(255, 255, 255, 0.15)',
              }}
              c="white"
            >
              bon
            </Title>
            <Text c="rgba(255, 255, 255, 0.5)" fw={400} style={{ fontSize: 31 }}>
              חש<span style={{ color: 'white', fontWeight: 700 }}>בונ</span>יות
            </Text>
          </Stack>

          <Paper
            p="xl"
            radius="xl"
            w={{ base: '100%', xs: 340 }}
            className="fadeInUp"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
            }}
          >
            <Stack gap="lg">
              <Button
                leftSection={<IconBrandGoogleFilled size={18} />}
                onClick={loginWithGoogle}
                variant="filled"
                color="brand"
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
    </AnimatedBackground>
  );
}
