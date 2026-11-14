import type { JobStatus } from '@quantforge/api-client';

export const isActive = (s: JobStatus) => s === 'QUEUED' || s === 'RUNNING';
