import { Inject, Logger, type OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Redis } from 'ioredis';
import type { Server, Socket } from 'socket.io';
import type { AccessTokenPayload } from '../common/auth/jwt.strategy.js';
import { PrismaService } from '../common/database/prisma.service.js';
import { REDIS_QUEUE } from '../common/redis/redis.module.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type AuthedSocket = Socket & { data: { userId?: string } };

/**
 * ADR-004. Workers publish to Redis `qf:events:{workspaceId}` after committing; this gateway relays
 * to the room `workspace:{id}`. Clients treat events as invalidation signals and refetch via REST.
 */
@WebSocketGateway({ namespace: '/ws' })
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy {
  @WebSocketServer() private server!: Server;
  private readonly log = new Logger('EventsGateway');
  private sub?: Redis;

  constructor(
    private readonly jwt: JwtService,
    private readonly db: PrismaService,
    @Inject(REDIS_QUEUE) private readonly redis: Redis,
  ) {}

  async afterInit() {
    this.sub = this.redis.duplicate();
    await this.sub.psubscribe('qf:events:*');
    this.sub.on('pmessage', (_pattern: string, channel: string, message: string) => {
      const workspaceId = channel.slice('qf:events:'.length);
      if (!UUID_RE.test(workspaceId)) return;
      try {
        const event = JSON.parse(message) as { type?: unknown };
        if (typeof event.type !== 'string') return;
        this.server.to(`workspace:${workspaceId}`).emit(event.type, event);
      } catch {
        this.log.warn(`dropping malformed event on ${channel}`);
      }
    });
  }

  async handleConnection(socket: AuthedSocket) {
    const token: unknown = socket.handshake.auth?.token;
    try {
      if (typeof token !== 'string') throw new Error('missing token');
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      socket.data.userId = payload.sub;
    } catch {
      socket.emit('error', { code: 'UNAUTHENTICATED' });
      socket.disconnect(true);
    }
  }

  @SubscribeMessage('workspace.join')
  async join(@ConnectedSocket() socket: AuthedSocket, @MessageBody() body: { workspaceId?: unknown }) {
    const userId = socket.data.userId;
    const workspaceId = body?.workspaceId;
    if (!userId || typeof workspaceId !== 'string' || !UUID_RE.test(workspaceId)) {
      return { ok: false, code: 'WORKSPACE_FORBIDDEN' };
    }
    const member = await this.db.withContext({ userId }, (tx) =>
      tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } }),
    );
    if (!member) return { ok: false, code: 'WORKSPACE_FORBIDDEN' };
    // A socket follows one workspace at a time (the one selected in the UI).
    for (const room of socket.rooms) if (room.startsWith('workspace:')) await socket.leave(room);
    await socket.join(`workspace:${workspaceId}`);
    return { ok: true };
  }

  onModuleDestroy() {
    this.sub?.disconnect();
  }
}
