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

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
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
      const message = extractErrorMessage(this.state.error, 'An unexpected error occurred');
      return (
        <Stack p="xl" mih="100vh" justify="center" align="center">
          <StatusCard
            status="error"
            title="Something went wrong"
            description={message}
            primaryAction={{ label: 'Try again', onClick: this.handleReset }}
            secondaryAction={
              <Button variant="subtle" onClick={() => window.location.reload()}>
                Reload page
              </Button>
            }
          />
        </Stack>
      );
    }

    return this.props.children;
  }
}
