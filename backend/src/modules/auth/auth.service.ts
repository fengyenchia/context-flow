import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash as argonHash, verify as argonVerify, argon2id } from 'argon2';
import { createHash, randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { AppStore, type UserRecord } from '../../db/app-store.js';
import type { ChangePasswordDto, RegisterDto, ResetPasswordDto } from './auth.dto.js';

interface RefreshPayload {
  sub: string;
  sid: string;
  tokenVersion: number;
  typ: 'refresh';
}

@Injectable()
export class AuthService {
  constructor(private readonly store: AppStore, private readonly jwt: JwtService) {}

  async register(dto: RegisterDto) {
    if (dto.password.toLowerCase().includes(dto.username.toLowerCase())) {
      throw new BadRequestException('Password must not contain the username');
    }
    const passwordHash = await argonHash(dto.password, { type: argon2id });
    const user = this.store.createUser({
      username: dto.username,
      displayName: dto.displayName,
      passwordHash,
    });
    return this.store.publicUser(user);
  }

  async login(username: string, password: string, userAgent?: string, ipAddress?: string) {
    const user = this.store.findUserByUsername(username);
    if (!user || user.status !== 'active' || !(await argonVerify(user.passwordHash, password))) {
      throw new UnauthorizedException('Invalid username or password');
    }
    user.lastLoginAt = new Date();
    return this.issueTokens(user, userAgent, ipAddress);
  }

  async refresh(refreshToken: string | undefined, userAgent?: string, ipAddress?: string) {
    if (!refreshToken) throw new UnauthorizedException('Missing refresh token');
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: env.JWT_REFRESH_SECRET,
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (payload.typ !== 'refresh') throw new UnauthorizedException('Invalid token type');
    const session = this.store.sessions.get(payload.sid);
    const user = this.store.users.get(payload.sub);
    if (
      !session || session.revokedAt || session.expiresAt <= new Date() ||
      session.tokenHash !== this.digest(refreshToken) || !user || user.status !== 'active' ||
      user.tokenVersion !== payload.tokenVersion
    ) {
      throw new UnauthorizedException('Refresh session is no longer valid');
    }
    session.revokedAt = new Date();
    return this.issueTokens(user, userAgent, ipAddress);
  }

  logout(refreshToken?: string) {
    if (!refreshToken) return;
    const digest = this.digest(refreshToken);
    for (const session of this.store.sessions.values()) {
      if (session.tokenHash === digest) session.revokedAt = new Date();
    }
  }

  logoutAll(userId: string) {
    for (const session of this.store.sessions.values()) {
      if (session.userId === userId) session.revokedAt = new Date();
    }
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = this.store.requireUser(userId);
    if (!(await argonVerify(user.passwordHash, dto.currentPassword))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    user.passwordHash = await argonHash(dto.newPassword, { type: argon2id });
    user.tokenVersion += 1;
    this.logoutAll(userId);
  }

  async resetPassword(dto: ResetPasswordDto) {
    const digest = this.digest(dto.resetCode);
    const record = [...this.store.passwordResets.values()].find((item) => item.tokenHash === digest);
    if (!record || record.consumedAt || record.expiresAt <= new Date()) {
      throw new BadRequestException('Reset code is invalid or expired');
    }
    const user = this.store.requireUser(record.userId);
    user.passwordHash = await argonHash(dto.newPassword, { type: argon2id });
    user.tokenVersion += 1;
    record.consumedAt = new Date();
    this.logoutAll(user.id);
  }

  private async issueTokens(user: UserRecord, userAgent?: string, ipAddress?: string) {
    const sid = randomUUID();
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role, tokenVersion: user.tokenVersion },
      { secret: env.JWT_ACCESS_SECRET, issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE, algorithm: 'HS256', expiresIn: env.JWT_ACCESS_TTL_SECONDS },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, sid, tokenVersion: user.tokenVersion, typ: 'refresh' },
      { secret: env.JWT_REFRESH_SECRET, issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE, algorithm: 'HS256', expiresIn: env.JWT_REFRESH_TTL_SECONDS },
    );
    this.store.sessions.set(sid, {
      id: sid,
      userId: user.id,
      tokenHash: this.digest(refreshToken),
      expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_SECONDS * 1000),
      userAgent,
      ipAddress,
    });
    return { accessToken, refreshToken, user: this.store.publicUser(user) };
  }

  private digest(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
