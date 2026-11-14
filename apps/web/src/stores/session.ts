import type { User } from '@quantforge/api-client';
import { create } from 'zustand';

const WS_KEY = 'qf.workspaceId';

function readWorkspace(): string | null {
  try {
    return localStorage.getItem(WS_KEY);
  } catch {
    return null;
  }
}

interface SessionState {
  /** ADR-007: the access token lives in memory only, never in storage. */
  accessToken: string | null;
  user: User | null;
  /** Selected workspace. Remembered per browser; the server re-checks membership on every request. */
  workspaceId: string | null;
  status: 'booting' | 'authenticated' | 'anonymous';
  setSession: (token: string, user: User) => void;
  setToken: (token: string) => void;
  setWorkspace: (id: string | null) => void;
  clear: () => void;
}

export const useSession = create<SessionState>((set) => ({
  accessToken: null,
  user: null,
  workspaceId: readWorkspace(),
  status: 'booting',
  setSession: (accessToken, user) => set({ accessToken, user, status: 'authenticated' }),
  setToken: (accessToken) => set({ accessToken }),
  setWorkspace: (workspaceId) => {
    try {
      if (workspaceId) localStorage.setItem(WS_KEY, workspaceId);
      else localStorage.removeItem(WS_KEY);
    } catch {
      /* storage unavailable: selection just isn't remembered */
    }
    set({ workspaceId });
  },
  clear: () => set({ accessToken: null, user: null, status: 'anonymous' }),
}));
