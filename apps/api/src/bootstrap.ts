import { type INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Redis } from 'ioredis';
import { Logger } from 'nestjs-pino';
import { ApiError } from './common/http/error.filter.js';
import { REDIS_CACHE } from './common/redis/redis.module.js';
import type { Env } from './config/env.js';
import { RedisIoAdapter } from './events/redis-io.adapter.js';

/** Routing shape (prefix + versioning). Shared with the OpenAPI export so paths always match. */
export function configureRouting(app: INestApplication) {
  app.setGlobalPrefix('api', { exclude: ['health', 'ready'] });
  app.enableVersioning({ type: VersioningType.URI });
}

/** Shared by main.ts and the e2e tests, so both see the same app. */
export function configureApp(app: NestExpressApplication) {
  const config = app.get(ConfigService<Env, true>);
  app.useLogger(app.get(Logger));
  app.set('trust proxy', 'loopback');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: config.get('WEB_ORIGIN'), credentials: true });
  configureRouting(app);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        new ApiError(
          400,
          'VALIDATION_FAILED',
          'Request validation failed',
          errors.flatMap((e) =>
            Object.entries(e.constraints ?? { invalid: 'invalid value' }).map(([issue, message]) => ({
              path: e.property,
              issue,
              message,
            })),
          ),
        ),
    }),
  );
  app.useWebSocketAdapter(new RedisIoAdapter(app, app.get<Redis>(REDIS_CACHE), config.get('WEB_ORIGIN')));
  app.enableShutdownHooks();
}

export function buildOpenApi(app: INestApplication) {
  const doc = new DocumentBuilder()
    .setTitle('QuantForge API')
    .setDescription('Public REST API. Generated from NestJS DTOs; the source of truth for client types (ADR-001).')
    .setVersion('1.0.0')
    .addBearerAuth()
    .addCookieAuth('qf_refresh')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Workspace-Id', description: 'Selected workspace UUID' }, 'workspace')
    .build();
  return SwaggerModule.createDocument(app, doc);
}
