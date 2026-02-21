import { type ReactNode, useEffect, useState } from 'react';
import { AppShell, Center, Loader } from '@mantine/core';
import Header from './Header';
import Navbar from './Navbar';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Login } from './pages/Login';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { BusinessProvider, useBusiness } from './contexts/BusinessContext';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { Onboarding } from './pages/Onboarding';
import { BusinessList } from './pages/BusinessList';
import { BusinessSettings } from './pages/BusinessSettings';
import { TeamManagement } from './pages/TeamManagement';
import { InvitationAccept } from './pages/InvitationAccept';
import { CustomerList } from './pages/CustomerList';
import { CustomerCreate } from './pages/CustomerCreate';
import { CustomerDetail } from './pages/CustomerDetail';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';
import { GlobalLoadingIndicator } from './components/GlobalLoadingIndicator';

function ProtectedRoute({ children }: Readonly<{ children: ReactNode }>) {
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

function OnboardingGuard({ children }: Readonly<{ children: ReactNode }>) {
  const { businesses, isLoading } = useBusiness();
  const location = useLocation();

  if (isLoading) {
    return (
      <Center h="100%">
        <Loader size="sm" aria-label="Loading businesses" role="status" />
      </Center>
    );
  }

  if (businesses.length === 0 && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
}

function ProtectedLayout() {
  const [opened, setOpened] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpened(false);
  }, [location.pathname]);

  const toggle = () => setOpened((o) => !o);

  return (
    <AppShell
      header={{ height: { base: 56, sm: 0 } }}
      navbar={{ width: 260, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="xl"
    >
      <AppShell.Header>
        <Header opened={opened} toggle={toggle} />
      </AppShell.Header>

      <Navbar />

      <AppShell.Main
        style={{
          backgroundColor: 'var(--mantine-color-body)',
          minHeight: '100vh',
        }}
      >
        <RouteErrorBoundary>
          <OnboardingGuard>
            <Outlet />
          </OnboardingGuard>
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
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute>
                  <BusinessProvider>
                    <Onboarding />
                  </BusinessProvider>
                </ProtectedRoute>
              }
            />
          </Route>

          <Route
            element={
              <ProtectedRoute>
                <BusinessProvider>
                  <ProtectedLayout />
                </BusinessProvider>
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/businesses" element={<BusinessList />} />
            <Route path="/business/settings" element={<BusinessSettings />} />
            <Route path="/business/customers" element={<CustomerList />} />
            <Route path="/business/customers/new" element={<CustomerCreate />} />
            <Route path="/business/customers/:customerId" element={<CustomerDetail />} />
            <Route path="/business/team" element={<TeamManagement />} />
            <Route path="/invitations/accept" element={<InvitationAccept />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </GlobalLoadingIndicator>
    </AuthProvider>
  );
}
