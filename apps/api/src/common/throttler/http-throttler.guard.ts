import { type ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/** Rate limiting applies to HTTP requests only; socket messages are not throttled here. */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return Promise.resolve(true);
    return super.canActivate(ctx);
  }
}
