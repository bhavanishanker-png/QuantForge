import { defineConfig } from 'vitest/config';

// Full-stack tests: need `docker compose up` (api, worker, dispatcher) with short reaper timings:
//   HEARTBEAT_EVERY_S=1 STALE_AFTER_S=5 REAPER_EVERY_S=1 docker compose up -d --wait
export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.pipeline-spec.ts'],
    testTimeout: 90_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
