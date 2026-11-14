import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api';

/** Every view has loading, empty, error and success states (completeIdea §3.1). */
export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-14 text-center">
      <Icon className="mb-3 size-8 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Couldn't load this</AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-4">
        <span>{errorMessage(error)}</span>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
