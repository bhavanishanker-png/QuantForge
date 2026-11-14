import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../../config/env.js';

/** ADR-006: two instances. QUEUE = broker + pub/sub (never evicts); CACHE = cache, rate limits, Socket.IO adapter. */
export const REDIS_QUEUE = Symbol('REDIS_QUEUE');
export const REDIS_CACHE = Symbol('REDIS_CACHE');

@Global()
@Module({
  providers: [
    {
      provide: REDIS_QUEUE,
      inject: [ConfigService],
      useFactory: (c: ConfigService<Env, true>) => new Redis(c.get('REDIS_QUEUE_URL'), { lazyConnect: true }),
    },
    {
      provide: REDIS_CACHE,
      inject: [ConfigService],
      useFactory: (c: ConfigService<Env, true>) => new Redis(c.get('REDIS_CACHE_URL'), { lazyConnect: true }),
    },
  ],
  exports: [REDIS_QUEUE, REDIS_CACHE],
})
export class RedisModule implements OnModuleDestroy {
  constructor(
    @Inject(REDIS_QUEUE) private readonly queue: Redis,
    @Inject(REDIS_CACHE) private readonly cache: Redis,
  ) {}

  onModuleDestroy() {
    this.queue.disconnect();
    this.cache.disconnect();
  }
}
