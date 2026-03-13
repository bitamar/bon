import { type ReactNode, useEffect, useState } from 'react';
import { AppShell } from '@mantine/core';
import Header from './Header';
import Navbar from './Navbar';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Login } from './pages/Login';
import { LandingPage } from './pages/LandingPage';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { BusinessProvider, useBusiness } from './contexts/BusinessContext';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { Onboarding } from './pages/Onboarding';
import { BusinessSettings } from './pages/BusinessSettings';
import { CustomerList } from './pages/CustomerList';
import { CustomerCreate } from './pages/CustomerCreate';
import { CustomerDetail } from './pages/CustomerDetail';
import { InvoiceList } from './pages/InvoiceList';
import { InvoiceNew } from './pages/InvoiceNew';
import { InvoiceEdit } from './pages/InvoiceEdit';
import { InvoiceDetail } from './pages/InvoiceDetail';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';
import { GlobalLoadingIndicator } from './components/GlobalLoadingIndicator';
import { AppSplash } from './components/AppSplash';
import { BusinessRoute } from './components/BusinessRoute';
import { LegacyRedirect } from './components/LegacyRedirect';

function HomeRedirect() {
  const { activeBusiness, isLoading } = useBusiness();
  if (isLoading) return <AppSplash label="Loading businesses" />;
  if (!activeBusiness) return <Navigate to="/onboarding" replace />;
  return <Navigate to={`/businesses/${activeBusiness.id}/dashboard`} replace />;
}

function ProtectedRoute({ children }: Readonly<{ children: ReactNode }>) {
  const { user, isHydrated } = useAuth();
  if (!isHydrated) {
    return <AppSplash label="Loading user" />;
  }
  if (!user) return <Navigate to="/welcome" replace />;
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
    return <AppSplash label="Loading businesses" />;
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
            <Route path="/welcome" element={<LandingPage />} />
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
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/businesses/:businessId" element={<BusinessRoute />}>
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="settings" element={<BusinessSettings />} />
              <Route path="customers" element={<CustomerList />} />
              <Route path="customers/new" element={<CustomerCreate />} />
              <Route path="customers/:customerId" element={<CustomerDetail />} />
              <Route path="invoices" element={<InvoiceList />} />
              <Route path="invoices/new" element={<InvoiceNew />} />
              <Route path="invoices/:invoiceId" element={<InvoiceDetail />} />
              <Route path="invoices/:invoiceId/edit" element={<InvoiceEdit />} />
            </Route>
            <Route path="/business/*" element={<LegacyRedirect />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </GlobalLoadingIndicator>
    </AuthProvider>
  );
}
