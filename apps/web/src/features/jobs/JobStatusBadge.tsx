import type { JobStatus } from '@quantforge/api-client';
import { cn } from '@/lib/utils';

const STYLES: Record<JobStatus, string> = {
  QUEUED: 'bg-muted text-muted-foreground',
  RUNNING: 'bg-sky-500/15 text-sky-400',
  COMPLETED: 'bg-emerald-500/15 text-emerald-400',
  FAILED: 'bg-red-500/15 text-red-400',
  CANCELLED: 'bg-zinc-500/15 text-zinc-400',
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs font-medium', STYLES[status])}>
      {status === 'RUNNING' && <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden />}
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}
