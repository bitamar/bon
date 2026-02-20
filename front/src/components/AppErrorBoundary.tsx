import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Stack } from '@mantine/core';
import { StatusCard } from './StatusCard';
import { extractErrorMessage } from '../lib/notifications';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class AppErrorBoundary extends Component<
  Readonly<AppErrorBoundaryProps>,
  AppErrorBoundaryState
> {
  override state: AppErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in application', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  override render() {
    if (this.state.hasError) {
      const message = extractErrorMessage(this.state.error, 'אירעה שגיאה בלתי צפויה');
      return (
        <Stack p="xl" mih="100vh" justify="center" align="center">
          <StatusCard
            status="error"
            title="משהו השתבש"
            description={message}
            primaryAction={{ label: 'נסה שוב', onClick: this.handleReset }}
            secondaryAction={
              <Button variant="subtle" onClick={() => globalThis.location.reload()}>
                טען מחדש
              </Button>
            }
          />
        </Stack>
      );
    }

    return this.props.children;
  }
}
