import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { LoginDto } from './dto/login.dto';
import type { RefreshTokenDto } from './dto/refresh-token.dto';
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
} from './interfaces/token-payload.interface';
import type { AuthTokenResponse } from './types/auth-token-response.type';

@Injectable()
export class AuthService {
  private readonly refreshSessions = new Map<string, string>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(payload: LoginDto): Promise<AuthTokenResponse> {
    const organizationRoles = Object.fromEntries(
      (payload.organizationRoles ?? []).map((entry) => [
        entry.organizationId,
        entry.roles,
      ]),
    );

    return this.issueTokenPair({
      sub: payload.userId,
      email: payload.email,
      globalRoles: payload.globalRoles ?? [],
      organizationRoles,
      permissions: payload.permissions ?? [],
      tokenType: 'access',
    });
  }

  async refresh({ refreshToken }: RefreshTokenDto): Promise<AuthTokenResponse> {
    const payload = await this.verifyRefreshToken(refreshToken);

    const activeSessionUserId = this.refreshSessions.get(payload.sessionId);
    if (!activeSessionUserId || activeSessionUserId !== payload.sub) {
      throw new UnauthorizedException('Refresh session is no longer valid.');
    }

    this.refreshSessions.delete(payload.sessionId);

    return this.issueTokenPair({
      sub: payload.sub,
      email: payload.email,
      globalRoles: payload.globalRoles,
      organizationRoles: payload.organizationRoles,
      permissions: payload.permissions,
      tokenType: 'access',
    });
  }

  async logout({ refreshToken }: RefreshTokenDto): Promise<{ success: true }> {
    const payload = await this.verifyRefreshToken(refreshToken);

    this.refreshSessions.delete(payload.sessionId);

    return { success: true };
  }

  private async verifyRefreshToken(
    refreshToken: string,
  ): Promise<RefreshTokenPayload> {
    let payload: RefreshTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        refreshToken,
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        },
      );
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or expired.');
    }

    if (payload.tokenType !== 'refresh') {
      throw new UnauthorizedException('Provided token is not a refresh token.');
    }

    return payload;
  }

  private async issueTokenPair(
    accessPayload: AccessTokenPayload,
  ): Promise<AuthTokenResponse> {
    const refreshTokenExpiresIn = this.configService.getOrThrow<number>(
      'JWT_REFRESH_EXPIRES_IN_SECONDS',
    );
    const jwtRefreshSecret =
      this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');

    const sessionId = randomUUID();
    this.refreshSessions.set(sessionId, accessPayload.sub);

    const refreshPayload: RefreshTokenPayload = {
      sub: accessPayload.sub,
      email: accessPayload.email,
      globalRoles: accessPayload.globalRoles,
      organizationRoles: accessPayload.organizationRoles,
      permissions: accessPayload.permissions,
      tokenType: 'refresh',
      sessionId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload),
      this.jwtService.signAsync(refreshPayload, {
        secret: jwtRefreshSecret,
        expiresIn: refreshTokenExpiresIn,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }
}
