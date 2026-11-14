import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useSession } from '@/stores/session';
import { refreshSession } from './api';

export type ConnectionState = 'connecting' | 'live' | 'offline';

/**
 * ADR-004: socket events are invalidation signals. On every event (and every reconnect) we refetch
 * through REST, so a missed message only delays the UI; Postgres stays the source of truth.
 */
export function useRealtime(): ConnectionState {
  const token = useSession((s) => s.accessToken);
  const workspaceId = useSession((s) => s.workspaceId);
  const qc = useQueryClient();
  const [state, setState] = useState<ConnectionState>('connecting');

  useEffect(() => {
    if (!token || !workspaceId) return;
    const socket: Socket = io('/ws', {
      auth: (cb) => cb({ token: useSession.getState().accessToken }),
      transports: ['websocket'],
    });
    const join = () =>
      socket.emit('workspace.join', { workspaceId }, (ack: { ok: boolean }) => {
        setState(ack?.ok ? 'live' : 'offline');
        void qc.invalidateQueries({ queryKey: ['jobs', workspaceId] });
      });
    socket.on('connect', join);
    socket.on('disconnect', () => setState('offline'));
    socket.on('connect_error', () => {
      setState('offline');
      // The access token may have expired; refresh and the next reconnect attempt uses the new one.
      void refreshSession();
    });
    socket.on('job.updated', () => {
      void qc.invalidateQueries({ queryKey: ['jobs', workspaceId] });
    });
    return () => {
      socket.close();
    };
  }, [token, workspaceId, qc]);

  return token && workspaceId ? state : 'offline';
}
