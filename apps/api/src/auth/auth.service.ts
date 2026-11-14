import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuditService } from '../audit/audit.service.js';
import type { AccessTokenPayload } from '../common/auth/jwt.strategy.js';
import { PrismaService } from '../common/database/prisma.service.js';
import { ApiError } from '../common/http/error.filter.js';
import type { Env } from '../config/env.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import type { AuthResponseDto, LoginDto, RegisterDto } from './dto.js';

// ADR-007: Argon2id with the OWASP baseline parameters.
const ARGON2_OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

interface LoginRow {
  id: string;
  password_hash: string;
  display_name: string;
  disabled_at: Date | null;
}

export interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

export interface IssuedSession {
  body: AuthResponseDto;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest();

@Injectable()
export class AuthService {
  private dummyHash?: Promise<string>;

  constructor(
    private readonly db: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly audit: AuditService,
    private readonly workspaces: WorkspacesService,
  ) {}

  async register(dto: RegisterDto, client: ClientInfo): Promise<IssuedSession> {
    const existing = await this.findLoginRow(dto.email);
    if (existing) throw new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists');

    const userId = randomUUID();
    const workspaceId = randomUUID();
    const passwordHash = await argon2.hash(dto.password, ARGON2_OPTS);

    await this.db.withContext({ userId, workspaceId }, async (tx) => {
      await tx.user.create({
        data: { id: userId, email: dto.email, passwordHash, displayName: dto.displayName },
      });
      await this.workspaces.createInTx(tx, { id: workspaceId, userId, name: `${dto.displayName}'s workspace` });
      await this.audit.record(tx, { actorUserId: userId, action: 'auth.registered', resourceType: 'user', resourceId: userId, ip: client.ip });
    });
    return this.issueSession({ id: userId, email: dto.email, displayName: dto.displayName }, randomUUID(), client);
  }

  async login(dto: LoginDto, client: ClientInfo): Promise<IssuedSession> {
    const row = await this.findLoginRow(dto.email);
    // Always run one Argon2 verification so response time doesn't reveal whether the email exists.
    const hash = row?.password_hash ?? (await this.getDummyHash());
    const ok = await argon2.verify(hash, dto.password).catch(() => false);
    if (!row || !ok || row.disabled_at) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }
    await this.db.withContext({ userId: row.id }, (tx) =>
      this.audit.record(tx, { actorUserId: row.id, action: 'auth.login', ip: client.ip }),
    );
    return this.issueSession({ id: row.id, email: dto.email, displayName: row.display_name }, randomUUID(), client);
  }

  /** Rotates the refresh token. Presenting an already-used token revokes the whole family (ADR-007). */
  async refresh(presented: string | undefined, client: ClientInfo): Promise<IssuedSession> {
    const invalid = new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Session expired, please log in again');
    if (!presented) throw invalid;
    const db = this.db.client;
    const token = await db.refreshToken.findUnique({ where: { tokenHash: sha256(presented) } });
    if (!token) throw invalid;

    if (token.revokedAt) {
      await this.revokeFamily(token.familyId);
      await this.db.withContext({ userId: token.userId }, (tx) =>
        this.audit.record(tx, {
          actorUserId: token.userId,
          action: 'auth.refresh_token_reuse_detected',
          metadata: { familyId: token.familyId },
          ip: client.ip,
        }),
      );
      throw invalid;
    }
    if (token.expiresAt <= new Date()) throw invalid;

    // Atomically consume this token. If a concurrent request won the race, treat it as reuse.
    const consumed = await db.refreshToken.updateMany({
      where: { id: token.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (consumed.count !== 1) {
      await this.revokeFamily(token.familyId);
      throw invalid;
    }

    const user = await this.db.withContext({ userId: token.userId }, (tx) =>
      tx.user.findUnique({ where: { id: token.userId } }),
    );
    if (!user || user.disabledAt) throw invalid;
    const session = await this.issueSession(user, token.familyId, client);
    const next = await db.refreshToken.findUnique({ where: { tokenHash: sha256(session.refreshToken) } });
    await db.refreshToken.update({ where: { id: token.id }, data: { replacedById: next!.id } });
    return session;
  }

  async logout(presented: string | undefined) {
    if (!presented) return;
    const token = await this.db.client.refreshToken.findUnique({ where: { tokenHash: sha256(presented) } });
    if (token) await this.revokeFamily(token.familyId);
  }

  private async revokeFamily(familyId: string) {
    await this.db.client.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueSession(
    user: { id: string; email: string; displayName: string },
    familyId: string,
    client: ClientInfo,
  ): Promise<IssuedSession> {
    const ttl = this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
    const payload: AccessTokenPayload = { sub: user.id, sid: familyId };
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: ttl,
      issuer: 'quantforge',
      audience: 'quantforge-api',
    });
    const refreshToken = randomBytes(32).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }) * 86_400_000);
    await this.db.client.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: sha256(refreshToken),
        expiresAt: refreshExpiresAt,
        userAgent: client.userAgent?.slice(0, 300),
        ip: client.ip,
      },
    });
    return {
      body: { accessToken, expiresIn: ttl, user: { id: user.id, email: user.email, displayName: user.displayName } },
      refreshToken,
      refreshExpiresAt,
    };
  }

  private async findLoginRow(email: string): Promise<LoginRow | undefined> {
    const rows = await this.db.client.$queryRaw<LoginRow[]>`SELECT * FROM auth_user_by_email(${email})`;
    return rows[0];
  }

  private getDummyHash() {
    this.dummyHash ??= argon2.hash(randomBytes(16).toString('hex'), ARGON2_OPTS);
    return this.dummyHash;
  }
}
