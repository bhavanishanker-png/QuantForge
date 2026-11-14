import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { duration, timeAgo } from '@/lib/format';
import { JobStatusBadge } from './JobStatusBadge';
import { isActive } from './status';

describe('JobStatusBadge', () => {
  it.each([
    ['QUEUED', 'Queued'],
    ['RUNNING', 'Running'],
    ['COMPLETED', 'Completed'],
    ['FAILED', 'Failed'],
    ['CANCELLED', 'Cancelled'],
  ] as const)('%s renders as %s', (status, label) => {
    render(<JobStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('only QUEUED and RUNNING count as active', () => {
    expect(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'].filter((s) => isActive(s as never))).toEqual(['QUEUED', 'RUNNING']);
  });
});

describe('format', () => {
  const now = Date.parse('2026-11-14T12:00:00Z');
  it('timeAgo', () => {
    expect(timeAgo('2026-11-14T11:59:50Z', now)).toMatch(/second/);
    expect(timeAgo('2026-11-14T11:30:00Z', now)).toMatch(/30 minutes ago/);
    expect(timeAgo(null, now)).toBe('—');
  });
  it('duration', () => {
    expect(duration('2026-11-14T11:59:57.500Z', '2026-11-14T12:00:00Z')).toBe('2.5 s');
    expect(duration('2026-11-14T11:58:30Z', '2026-11-14T12:00:00Z')).toBe('1m 30s');
    expect(duration(null, null)).toBe('—');
  });
});
