import React from 'react';
import ReactDOM from 'react-dom/client';
import { DirectionProvider, MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { Notifications } from '@mantine/notifications';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { BrowserRouter } from 'react-router-dom';
import { queryClient } from './lib/queryClient';
import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { lightModeCssVariablesResolver, mantineThemeOverride } from './theme';

const container = document.getElementById('root');

if (container) {
  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <DirectionProvider>
          <MantineProvider
            defaultColorScheme="dark"
            theme={mantineThemeOverride}
            cssVariablesResolver={lightModeCssVariablesResolver}
          >
            <Notifications position="top-right" />
            <BrowserRouter>
              <AppErrorBoundary>
                <App />
              </AppErrorBoundary>
            </BrowserRouter>
          </MantineProvider>
        </DirectionProvider>
        {import.meta.env.DEV ? <ReactQueryDevtools /> : null}
      </QueryClientProvider>
    </React.StrictMode>
  );
}
