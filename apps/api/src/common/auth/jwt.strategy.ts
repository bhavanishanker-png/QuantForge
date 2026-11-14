import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Env } from '../../config/env.js';
import type { AuthUser } from './metadata.js';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('JWT_ACCESS_SECRET'),
      algorithms: ['HS256'],
      issuer: 'quantforge',
      audience: 'quantforge-api',
    });
  }

  validate(payload: AccessTokenPayload): AuthUser {
    return { userId: payload.sub, sessionId: payload.sid };
  }
}
