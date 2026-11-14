import { QueryClient } from '@tanstack/react-query';
import { ApiRequestError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, e) => !(e instanceof ApiRequestError && e.status < 500) && count < 2,
      refetchOnWindowFocus: true,
    },
  },
});

export const qk = {
  me: ['me'] as const,
  workspaces: ['workspaces'] as const,
  workspace: (id: string) => ['workspace', id] as const,
  members: (id: string) => ['workspace', id, 'members'] as const,
  jobs: (ws: string, filter?: string) => ['jobs', ws, filter ?? 'all'] as const,
  job: (ws: string, id: string) => ['jobs', ws, 'one', id] as const,
};
