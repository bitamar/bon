import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { createQueryClient, queryClient } from '../../lib/queryClient';

describe('queryClient helpers', () => {
  it('createQueryClient returns QueryClient with expected defaults', () => {
    const client = createQueryClient();

    expect(client).toBeInstanceOf(QueryClient);
    const defaults = client.getDefaultOptions();
    expect(defaults.queries?.retry).toBe(false);
    expect(defaults.queries?.refetchOnWindowFocus).toBe(true);
    expect(defaults.queries?.staleTime).toBe(5 * 60 * 1000);
    expect(defaults.mutations?.retry).toBe(false);
  });

  it('queryClient singleton is a QueryClient instance', () => {
    expect(queryClient).toBeInstanceOf(QueryClient);
  });
});
