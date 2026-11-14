import { LogOut } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Logo } from '@/features/auth/AuthLayout';
import { useCurrentWorkspace } from '@/features/workspaces/hooks';
import { WorkspaceSwitcher } from '@/features/workspaces/WorkspaceSwitcher';
import { queryClient } from '@/lib/query';
import { type ConnectionState, useRealtime } from '@/lib/realtime';
import { cn } from '@/lib/utils';
import { useSession } from '@/stores/session';
import { NAV } from './nav';

export function AppShell() {
  const connection = useRealtime();
  const user = useSession((s) => s.user);
  const { workspace } = useCurrentWorkspace();
  const clear = useSession((s) => s.clear);
  const navigate = useNavigate();

  const logout = async () => {
    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined);
    clear();
    queryClient.clear();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-svh bg-background text-foreground">
      <aside className="sticky top-0 flex h-svh w-60 shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="flex items-center gap-2 px-4 py-4">
          <Logo className="size-5" />
          <span className="font-semibold tracking-tight">QuantForge</span>
        </div>
        <div className="px-3 pb-3">
          <WorkspaceSwitcher />
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2" aria-label="Main">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                  isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
                )
              }
            >
              <item.icon className="size-4" />
              <span className="flex-1">{item.label}</span>
              {item.phase && <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">P{item.phase}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user?.displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={logout} aria-label="Sign out">
              <LogOut />
            </Button>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center justify-between border-b border-border px-6">
          <div className="text-sm text-muted-foreground">
            {workspace ? (
              <>
                <span className="text-foreground">{workspace.name}</span>
                <Badge variant="outline" className="ml-2 align-middle text-[10px]">
                  {workspace.role}
                </Badge>
              </>
            ) : null}
          </div>
          <ConnectionIndicator state={connection} />
        </header>
        <main className="flex-1 px-6 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

const CONNECTION: Record<ConnectionState, { label: string; dot: string; hint: string }> = {
  live: { label: 'Live', dot: 'bg-emerald-500', hint: 'Receiving real-time updates' },
  connecting: { label: 'Connecting', dot: 'bg-amber-500 animate-pulse', hint: 'Connecting to real-time updates' },
  offline: { label: 'Offline', dot: 'bg-muted-foreground', hint: 'Real-time updates unavailable; data refreshes on focus' },
};

function ConnectionIndicator({ state }: { state: ConnectionState }) {
  const c = CONNECTION[state];
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
            <span className={cn('size-1.5 rounded-full', c.dot)} />
            {c.label}
          </span>
        }
      />
      <TooltipContent>{c.hint}</TooltipContent>
    </Tooltip>
  );
}
