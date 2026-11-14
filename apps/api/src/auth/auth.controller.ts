import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiCookieAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../common/auth/decorators.js';
import type { Env } from '../config/env.js';
import { AuthService, type ClientInfo, type IssuedSession } from './auth.service.js';
import { AuthResponseDto, LoginDto, RegisterDto } from './dto.js';

export const REFRESH_COOKIE = 'qf_refresh';
const COOKIE_PATH = '/api/v1/auth';
// ADR-007: 10 requests / minute on credential endpoints.
const AUTH_LIMIT = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('auth')
@Public()
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Post('register')
  @Throttle(AUTH_LIMIT)
  @ApiOkResponse({ type: AuthResponseDto })
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.send(res, await this.auth.register(dto, clientInfo(req)));
  }

  @Post('login')
  @HttpCode(200)
  @Throttle(AUTH_LIMIT)
  @ApiOkResponse({ type: AuthResponseDto })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.send(res, await this.auth.login(dto, clientInfo(req)));
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOkResponse({ type: AuthResponseDto })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      return this.send(res, await this.auth.refresh(readCookie(req), clientInfo(req)));
    } catch (e) {
      this.clearCookie(res);
      throw e;
    }
  }

  @Post('logout')
  @HttpCode(204)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiNoContentResponse()
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(readCookie(req));
    this.clearCookie(res);
  }

  private send(res: Response, s: IssuedSession): AuthResponseDto {
    res.cookie(REFRESH_COOKIE, s.refreshToken, {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      sameSite: 'strict',
      path: COOKIE_PATH,
      expires: s.refreshExpiresAt,
    });
    return s.body;
  }

  private clearCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
  }
}

function readCookie(req: Request): string | undefined {
  const v = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
  return typeof v === 'string' ? v : undefined;
}

function clientInfo(req: Request): ClientInfo {
  return { ip: req.ip, userAgent: req.header('user-agent') };
}
