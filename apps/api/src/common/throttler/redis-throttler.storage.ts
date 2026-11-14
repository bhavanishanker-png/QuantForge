import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Redis } from 'ioredis';

// Atomic fixed-window counter with optional block, stored in redis-cache (ADR-006).
const SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl <= 0 and hits > tonumber(ARGV[2]) and tonumber(ARGV[3]) > 0 then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  blockTtl = tonumber(ARGV[3])
end
return {hits, ttl, blockTtl}
`;

export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Redis) {}

  async increment(key: string, ttl: number, limit: number, blockDuration: number, name: string) {
    const k = `qf:throttle:${name}:${key}`;
    const [hits, ttlMs, blockMs] = (await this.redis.eval(SCRIPT, 2, k, `${k}:block`, ttl, limit, blockDuration)) as [
      number,
      number,
      number,
    ];
    const isBlocked = blockMs > 0 || hits > limit;
    return {
      totalHits: hits,
      timeToExpire: Math.ceil(Math.max(ttlMs, 0) / 1000),
      isBlocked,
      timeToBlockExpire: Math.ceil(Math.max(blockMs, isBlocked ? ttlMs : 0) / 1000),
    };
  }
}
