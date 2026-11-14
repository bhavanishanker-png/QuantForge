import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { refreshSession } from '@/lib/api';
import { useSession } from '@/stores/session';

/** On first load, restores the session from the httpOnly refresh cookie before rendering the app. */
export function RequireAuth() {
  const status = useSession((s) => s.status);
  const clear = useSession((s) => s.clear);
  const location = useLocation();

  useEffect(() => {
    if (status === 'booting') void refreshSession().then((s) => !s && clear());
  }, [status, clear]);

  if (status === 'booting') {
    return (
      <output className="grid min-h-svh place-items-center text-sm text-muted-foreground">Restoring your session…</output>
    );
  }
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Login/register: bounce signed-in users to the app (after trying to restore a session). */
export function GuestOnly() {
  const status = useSession((s) => s.status);
  const clear = useSession((s) => s.clear);
  useEffect(() => {
    if (status === 'booting') void refreshSession().then((s) => !s && clear());
  }, [status, clear]);
  if (status === 'booting') return null;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <Outlet />;
}
