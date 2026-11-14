import type { JobStatus } from '@quantforge/api-client';
import { Activity, Play } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState } from '@/components/app/States';
import { PageHeader } from '@/components/app/PageHeader';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { can, useCurrentWorkspace } from '@/features/workspaces/hooks';
import { errorMessage } from '@/lib/api';
import { duration, timeAgo } from '@/lib/format';
import { useCancelJob, useJobs, useRunPing } from './hooks';
import { JobStatusBadge } from './JobStatusBadge';
import { isActive } from './status';

const FILTERS: { value: JobStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'QUEUED', label: 'Queued' },
  { value: 'RUNNING', label: 'Running' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export function JobsPage() {
  const [filter, setFilter] = useState<JobStatus | 'ALL'>('ALL');
  const jobs = useJobs(filter === 'ALL' ? undefined : filter);
  const { workspace } = useCurrentWorkspace();
  const ping = useRunPing();
  const cancel = useCancelJob();
  const canRun = can(workspace?.role, 'DEVELOPER');

  const runPing = () =>
    ping.mutate(5, {
      onSuccess: () => toast.success('Diagnostic job queued'),
      onError: (e) => toast.error(errorMessage(e)),
    });

  return (
    <>
      <PageHeader
        title="Job Monitor"
        description="Background work in this workspace. Updates arrive live."
        actions={
          <>
            <Select value={filter} onValueChange={(v) => setFilter((v as JobStatus | 'ALL') ?? 'ALL')} items={FILTERS}>
              <SelectTrigger className="w-40" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canRun && (
              <Button onClick={runPing} disabled={ping.isPending}>
                <Play /> Run diagnostic job
              </Button>
            )}
          </>
        }
      />

      {jobs.isPending ? (
        <div className="space-y-2" aria-busy>
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : jobs.isError ? (
        <ErrorState error={jobs.error} onRetry={() => void jobs.refetch()} />
      ) : jobs.data.items.length === 0 ? (
        <EmptyState icon={Activity} title={filter === 'ALL' ? 'No jobs yet' : 'No jobs with this status'}>
          {filter === 'ALL'
            ? 'Market syncs, backtests and optimizations will appear here as they run. Run a diagnostic job to check the pipeline end to end.'
            : 'Try another filter.'}
        </EmptyState>
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-48">Progress</TableHead>
                <TableHead>Attempt</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.data.items.map((j) => (
                <TableRow key={j.id}>
                  <TableCell>
                    <div className="font-mono text-xs">{j.type}</div>
                    <div className="font-mono text-[10px] text-muted-foreground" title={j.id}>
                      {j.id.slice(0, 8)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <JobStatusBadge status={j.status} />
                    {j.errorCode && (
                      <div className="mt-1 max-w-56 truncate text-xs text-red-400" title={j.errorMessage ?? undefined}>
                        {j.errorCode}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={j.progress} className="h-1.5" aria-label={`${j.progress}%`} />
                      <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{Math.round(j.progress)}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {j.attempt}/{j.maxAttempts}
                  </TableCell>
                  <TableCell className="text-muted-foreground" title={j.createdAt}>
                    {timeAgo(j.createdAt)}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{duration(j.startedAt, j.finishedAt)}</TableCell>
                  <TableCell className="text-right">
                    {canRun && isActive(j.status) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={j.cancelRequested || cancel.isPending}
                        onClick={() => cancel.mutate(j.id, { onError: (e) => toast.error(errorMessage(e)) })}
                      >
                        {j.cancelRequested ? 'Cancelling…' : 'Cancel'}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
