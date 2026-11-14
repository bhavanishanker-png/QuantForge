import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from '../common/auth/jwt.strategy.js';
import type { Env } from '../config/env.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [
    PassportModule,
    WorkspacesModule,
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (c: ConfigService<Env, true>) => ({
        secret: c.get('JWT_ACCESS_SECRET'),
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'], issuer: 'quantforge', audience: 'quantforge-api' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
