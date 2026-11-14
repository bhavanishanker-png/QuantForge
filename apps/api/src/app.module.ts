import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { LoggerModule } from 'nestjs-pino';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard.js';
import { DatabaseModule } from './common/database/database.module.js';
import { ErrorFilter } from './common/http/error.filter.js';
import { REDIS_CACHE, RedisModule } from './common/redis/redis.module.js';
import { HttpThrottlerGuard } from './common/throttler/http-throttler.guard.js';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage.js';
import { type Env, validateEnv } from './config/env.js';
import { EventsModule } from './events/events.module.js';
import { HealthController } from './health/health.controller.js';
import { JobsModule } from './jobs/jobs.module.js';
import { SystemModule } from './system/system.module.js';
import { UsersModule } from './users/users.module.js';
import { WorkspacesModule } from './workspaces/workspaces.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Host development reads the repo-root .env; in containers the environment is injected.
      envFilePath: ['../../.env', '.env'],
      expandVariables: true,
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: c.get('LOG_LEVEL'),
          genReqId: (req, res) => {
            const incoming = req.headers['x-request-id'];
            const id = typeof incoming === 'string' && incoming.length <= 100 ? incoming : randomUUID();
            res.setHeader('x-request-id', id);
            return id;
          },
          redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
          autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/ready' },
          transport: c.get('NODE_ENV') === 'development' ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
        },
      }),
    }),
    DatabaseModule,
    RedisModule,
    AuditModule,
    ThrottlerModule.forRootAsync({
      inject: [REDIS_CACHE],
      useFactory: (redis: Redis) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
        storage: new RedisThrottlerStorage(redis),
      }),
    }),
    AuthModule,
    UsersModule,
    WorkspacesModule,
    JobsModule,
    SystemModule,
    EventsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: ErrorFilter },
    { provide: APP_GUARD, useClass: HttpThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
