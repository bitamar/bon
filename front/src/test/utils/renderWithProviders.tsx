import { MantineProvider, DirectionProvider } from '@mantine/core';
import { MemoryRouter, type MemoryRouterProps } from 'react-router-dom';
import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { useState } from 'react';

export interface RenderWithProvidersOptions {
  router?: MemoryRouterProps;
  renderOptions?: RenderOptions;
  withPortalRoot?: boolean;
}

export function renderWithProviders(
  ui: ReactElement,
  { router, renderOptions, withPortalRoot = true }: RenderWithProvidersOptions = {}
) {
  if (withPortalRoot && !document.getElementById('__mantine-portal')) {
    const portalRoot = document.createElement('div');
    portalRoot.setAttribute('id', '__mantine-portal');
    document.body.appendChild(portalRoot);
  }

  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    const [queryClient] = useState(
      () =>
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
    );

    return (
      <DirectionProvider>
        <MantineProvider>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter {...router}>{children}</MemoryRouter>
          </QueryClientProvider>
        </MantineProvider>
      </DirectionProvider>
    );
  };

  return render(ui, { wrapper: Wrapper, ...(renderOptions ?? {}) });
}
