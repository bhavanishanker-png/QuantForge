import { ArrowRight, CandlestickChart } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState, ErrorState } from '@/components/app/States';
import { PageHeader } from '@/components/app/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useJobs } from '@/features/jobs/hooks';
import { JobStatusBadge } from '@/features/jobs/JobStatusBadge';
import { isActive } from '@/features/jobs/status';
import { useCurrentWorkspace } from '@/features/workspaces/hooks';
import { timeAgo } from '@/lib/format';
import { useSession } from '@/stores/session';

/** Only real numbers from the API. Portfolio metrics appear once Virtual Trading exists (Phase 5). */
export function OverviewPage() {
  const user = useSession((s) => s.user);
  const { workspace } = useCurrentWorkspace();
  const jobs = useJobs(undefined, 50);
  const items = jobs.data?.items ?? [];
  const active = items.filter((j) => isActive(j.status)).length;
  const failed = items.filter((j) => j.status === 'FAILED').length;

  return (
    <>
      <PageHeader title={`Welcome, ${user?.displayName ?? ''}`} description={workspace ? `Workspace: ${workspace.name}` : undefined} />
      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Active jobs" value={jobs.isPending ? undefined : active} hint="Queued or running now" />
        <Stat label="Failed jobs" value={jobs.isPending ? undefined : failed} hint="Among the 50 most recent" />
        <Stat label="Your role" value={workspace?.role.toLowerCase()} hint="In this workspace" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
            <CardDescription>Latest background jobs</CardDescription>
          </CardHeader>
          <CardContent>
            {jobs.isPending ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-8" />
                ))}
              </div>
            ) : jobs.isError ? (
              <ErrorState error={jobs.error} onRetry={() => void jobs.refetch()} />
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {items.slice(0, 6).map((j) => (
                  <li key={j.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="font-mono text-xs">{j.type}</span>
                    <span className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{timeAgo(j.createdAt)}</span>
                      <JobStatusBadge status={j.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link to="/jobs" className="mt-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              Open Job Monitor <ArrowRight className="size-3.5" />
            </Link>
          </CardContent>
        </Card>

        <EmptyState icon={CandlestickChart} title="Portfolio and market data arrive in the next phases">
          Market data comes in Phase 2 and virtual accounts in Phase 5. Until then this dashboard shows only what really exists. No sample numbers.
        </EmptyState>
      </div>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string | undefined; hint: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value === undefined ? <Skeleton className="h-7 w-12" /> : value}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>
    </Card>
  );
}
