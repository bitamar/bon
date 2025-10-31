import { type ReactNode, useEffect, useState } from 'react';
import { AppShell, Center, Loader, useMantineColorScheme, useMantineTheme } from '@mantine/core';
import Header from './Header';
import Navbar from './Navbar';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Login } from './pages/Login';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';
import { GlobalLoadingIndicator } from './components/GlobalLoadingIndicator';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isHydrated } = useAuth();
  if (!isHydrated) {
    return (
      <Center h="100%">
        <Loader size="sm" aria-label="Loading user" role="status" />
      </Center>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PlainLayout() {
  return (
    <RouteErrorBoundary>
      <Outlet />
    </RouteErrorBoundary>
  );
}

function ProtectedLayout() {
  const [opened, setOpened] = useState(false);
  const location = useLocation();
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const lightAppBackground = theme.other['lightAppBackground'];

  useEffect(() => {
    // Close mobile navbar when navigating to a new route
    setOpened(false);
  }, [location.pathname]);

  return (
    <AppShell
      header={{ height: 64 }}
      navbar={{ width: 280, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding={{ base: 'xxs', sm: 'md' }}
    >
      <AppShell.Header>
        <Header opened={opened} setOpened={setOpened} />
      </AppShell.Header>

      <AppShell.Navbar>
        <Navbar />
      </AppShell.Navbar>

      <AppShell.Main
        style={{
          paddingTop: 'var(--app-shell-header-height, 0px)',
          ...(colorScheme === 'light'
            ? { backgroundColor: lightAppBackground, color: '#3d3d3d' }
            : {}),
        }}
      >
        <RouteErrorBoundary>
          <Outlet />
        </RouteErrorBoundary>
      </AppShell.Main>
    </AppShell>
  );
}

export default function AppRoutes() {
  return (
    <AuthProvider>
      <GlobalLoadingIndicator>
        <Routes>
          <Route element={<PlainLayout />}>
            <Route path="/login" element={<Login />} />
          </Route>

          <Route
            element={
              <ProtectedRoute>
                <ProtectedLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/settings" element={<Settings />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </GlobalLoadingIndicator>
    </AuthProvider>
  );
}
