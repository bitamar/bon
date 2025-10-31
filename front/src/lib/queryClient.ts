import { QueryClient, type DefaultOptions } from '@tanstack/react-query';

const defaultQueryOptions: DefaultOptions = {
  queries: {
    retry: false,
    refetchOnWindowFocus: true,
    staleTime: 5 * 60 * 1000,
  },
  mutations: {
    retry: false,
  },
};

export function createQueryClient() {
  return new QueryClient({ defaultOptions: defaultQueryOptions });
}

export const queryClient = createQueryClient();
