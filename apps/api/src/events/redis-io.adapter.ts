import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Redis } from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';

/** Lets several API replicas share Socket.IO rooms through redis-cache (ADR-006). */
export class RedisIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly redis: Redis,
    private readonly corsOrigin: string,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: Partial<ServerOptions>): Server {
    const opts = { ...options, cors: { origin: this.corsOrigin, credentials: true } } as ServerOptions;
    const server = super.createIOServer(port, opts) as Server;
    server.adapter(createAdapter(this.redis.duplicate(), this.redis.duplicate()));
    return server;
  }
}
