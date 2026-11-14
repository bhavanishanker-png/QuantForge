// Writes openapi.json from the compiled app WITHOUT needing Postgres or Redis (CI-friendly):
// placeholder config is used only to satisfy validation; nothing connects (Redis is lazy).
import { writeFileSync } from 'node:fs';

const placeholders: Record<string, string> = {
  APP_DATABASE_URL: 'postgresql://openapi:openapi@127.0.0.1:1/openapi',
  REDIS_QUEUE_URL: 'redis://127.0.0.1:1/0',
  REDIS_CACHE_URL: 'redis://127.0.0.1:1/0',
  JWT_ACCESS_SECRET: 'openapi-export-placeholder-secret-0000000000',
  INTERNAL_SERVICE_TOKEN: 'openapi-export-placeholder-token-000000000',
  LOG_LEVEL: 'silent',
};
for (const [k, v] of Object.entries(placeholders)) process.env[k] = v;

const { NestFactory } = await import('@nestjs/core');
const { AppModule } = await import('./app.module.js');
const { buildOpenApi, configureRouting } = await import('./bootstrap.js');

const app = await NestFactory.create(AppModule, { logger: false });
configureRouting(app);
const doc = buildOpenApi(app);
const out = new URL('../openapi.json', import.meta.url);
writeFileSync(out, JSON.stringify(doc, null, 2) + '\n');
console.log(`wrote openapi.json (${Object.keys(doc.paths).length} paths)`);
process.exit(0);
