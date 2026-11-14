import { Controller, Get, HttpStatus, Inject, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { Redis } from 'ioredis';
import { Public } from '../common/auth/decorators.js';
import { PrismaService } from '../common/database/prisma.service.js';
import { REDIS_CACHE, REDIS_QUEUE } from '../common/redis/redis.module.js';

const withTimeout = <T>(p: Promise<T>, ms = 2000) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller({ version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly db: PrismaService,
    @Inject(REDIS_QUEUE) private readonly queue: Redis,
    @Inject(REDIS_CACHE) private readonly cache: Redis,
  ) {}

  /** Liveness: the process is up. No dependency checks. */
  @Get('health')
  health() {
    return { status: 'ok' };
  }

  /** Readiness: dependencies reachable. */
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const checks = await Promise.allSettled([
      withTimeout(this.db.client.$queryRaw`SELECT 1`),
      withTimeout(this.queue.ping()),
      withTimeout(this.cache.ping()),
    ]);
    const [database, redisQueue, redisCache] = checks.map((c) => (c.status === 'fulfilled' ? 'ok' : 'down'));
    const ok = checks.every((c) => c.status === 'fulfilled');
    res.status(ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return { status: ok ? 'ok' : 'degraded', checks: { database, redisQueue, redisCache } };
  }
}
