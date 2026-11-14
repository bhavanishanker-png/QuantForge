import type { JobStatus } from '@quantforge/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { qk } from '@/lib/query';
import { useSession } from '@/stores/session';

export function useJobs(status?: JobStatus, limit = 50) {
  const ws = useSession((s) => s.workspaceId);
  return useQuery({
    queryKey: qk.jobs(ws ?? '', `${status ?? 'all'}:${limit}`),
    queryFn: () => unwrap(api.GET('/api/v1/jobs', { params: { query: { limit, ...(status && { status }) } } })),
    enabled: !!ws,
    // Live updates arrive over Socket.IO; this is a slow safety net if the socket is down.
    refetchInterval: 30_000,
  });
}

export function useRunPing() {
  const qc = useQueryClient();
  const ws = useSession((s) => s.workspaceId);
  return useMutation({
    mutationFn: (durationSec: number) => unwrap(api.POST('/api/v1/system/ping-job', { body: { durationSec } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs', ws] }),
  });
}

export function useCancelJob() {
  const qc = useQueryClient();
  const ws = useSession((s) => s.workspaceId);
  return useMutation({
    mutationFn: (id: string) => unwrap(api.POST('/api/v1/jobs/{id}/cancel', { params: { path: { id } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs', ws] }),
  });
}
