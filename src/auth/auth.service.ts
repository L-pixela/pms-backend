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
    const jwtRefreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET') ??
      'dev_refresh_secret';

    let payload: RefreshTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        refreshToken,
        {
          secret: jwtRefreshSecret,
        },
      );
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or expired.');
    }

    if (payload.tokenType !== 'refresh') {
      throw new UnauthorizedException('Provided token is not a refresh token.');
    }

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
    const jwtRefreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET') ??
      'dev_refresh_secret';

    const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
      refreshToken,
      {
        secret: jwtRefreshSecret,
      },
    );

    this.refreshSessions.delete(payload.sessionId);

    return { success: true };
  }

  private async issueTokenPair(
    accessPayload: AccessTokenPayload,
  ): Promise<AuthTokenResponse> {
    const accessTokenExpiresIn = Number(
      this.configService.get<string>('JWT_ACCESS_EXPIRES_IN_SECONDS') ?? 900,
    );
    const refreshTokenExpiresIn = Number(
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN_SECONDS') ??
        604800,
    );
    const jwtRefreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET') ??
      'dev_refresh_secret';

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
      this.jwtService.signAsync(accessPayload, {
        expiresIn: Number.isFinite(accessTokenExpiresIn)
          ? accessTokenExpiresIn
          : 900,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: jwtRefreshSecret,
        expiresIn: Number.isFinite(refreshTokenExpiresIn)
          ? refreshTokenExpiresIn
          : 604800,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }
}
