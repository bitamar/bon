import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { StatusCard } from './StatusCard';
import { extractErrorMessage } from '../lib/notifications';

interface RouteErrorBoundaryInnerProps {
  children: ReactNode;
  onReset: () => void;
}

interface RouteErrorBoundaryInnerState {
  hasError: boolean;
  error: Error | null;
}

class RouteErrorBoundaryInner extends Component<
  RouteErrorBoundaryInnerProps,
  RouteErrorBoundaryInnerState
> {
  override state: RouteErrorBoundaryInnerState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryInnerState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in routed content', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset();
  };

  override render() {
    if (this.state.hasError) {
      const message = extractErrorMessage(this.state.error, 'An unexpected error occurred');
      return (
        <StatusCard
          status="error"
          title="Something went wrong"
          description={message}
          primaryAction={{ label: 'Try again', onClick: this.handleReset }}
          secondaryAction={
            <Button variant="subtle" onClick={() => globalThis.location.reload()}>
              Reload page
            </Button>
          }
        />
      );
    }

    return this.props.children;
  }
}

export function RouteErrorBoundary({ children }: Readonly<{ children: ReactNode }>) {
  const queryClient = useQueryClient();
  return (
    <RouteErrorBoundaryInner
      onReset={() => {
        queryClient.resetQueries();
      }}
    >
      {children}
    </RouteErrorBoundaryInner>
  );
}
