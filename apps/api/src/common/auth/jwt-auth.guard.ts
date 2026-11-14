import { type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ApiError } from '../http/error.filter.js';
import { IS_PUBLIC } from './metadata.js';

/** Global guard: every route requires a valid access token unless marked @Public(). */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(ctx: ExecutionContext) {
    // Sockets authenticate in the gateway handshake (events.gateway.ts); this guard is HTTP-only.
    if (ctx.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    return isPublic ? true : super.canActivate(ctx);
  }

  handleRequest<T>(err: unknown, user: T, info: unknown): T {
    if (err || !user) {
      const expired = info instanceof Error && info.name === 'TokenExpiredError';
      throw new ApiError(401, expired ? 'TOKEN_EXPIRED' : 'UNAUTHENTICATED', 'Authentication required');
    }
    return user;
  }
}
