import type { Workspace, WorkspaceRole } from '@quantforge/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api, unwrap } from '@/lib/api';
import { qk } from '@/lib/query';
import { useSession } from '@/stores/session';

export function useWorkspaces() {
  return useQuery({
    queryKey: qk.workspaces,
    queryFn: () => unwrap(api.GET('/api/v1/workspaces', { params: { query: { pageSize: 100 } } })),
  });
}

/** The selected workspace, falling back to the first one if the remembered id is no longer valid. */
export function useCurrentWorkspace(): { workspace: Workspace | undefined; isLoading: boolean } {
  const { data, isLoading } = useWorkspaces();
  const workspaceId = useSession((s) => s.workspaceId);
  const setWorkspace = useSession((s) => s.setWorkspace);
  const workspace = data?.items.find((w) => w.id === workspaceId);

  useEffect(() => {
    if (data && !workspace) setWorkspace(data.items[0]?.id ?? null);
  }, [data, workspace, setWorkspace]);

  return { workspace: workspace ?? data?.items[0], isLoading };
}

const RANK: Record<WorkspaceRole, number> = { VIEWER: 0, DEVELOPER: 1, ADMIN: 2, OWNER: 3 };
/** UI hint only: the server enforces roles on every request. */
export const can = (role: WorkspaceRole | undefined, min: WorkspaceRole) => role !== undefined && RANK[role] >= RANK[min];

export function useCreateWorkspace() {
  const qc = useQueryClient();
  const setWorkspace = useSession((s) => s.setWorkspace);
  return useMutation({
    mutationFn: (name: string) => unwrap(api.POST('/api/v1/workspaces', { body: { name } })),
    onSuccess: async (ws) => {
      await qc.invalidateQueries({ queryKey: qk.workspaces });
      setWorkspace(ws.id);
    },
  });
}
