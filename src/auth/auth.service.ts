import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'node:crypto';
import { IsNull, QueryFailedError, Repository } from 'typeorm';
import { UserEntity } from '../modules/users/entities/user.entity';
import type { LoginDto } from './dto/login.dto';
import type { RefreshTokenDto } from './dto/refresh-token.dto';
import type { RegisterDto } from './dto/register.dto';
import { RefreshTokenSessionEntity } from './entities/refresh-token-session.entity';
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
} from './interfaces/token-payload.interface';
import type { AuthTokenResponse } from './types/auth-token-response.type';
import { UserClaimsService } from './user-claims.service';

const BCRYPT_COST = 12;
const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class AuthService {
  // Compared against when the email is unknown, so login takes the same time
  // whether or not an account exists.
  private readonly dummyPasswordHash = bcrypt.hashSync(
    randomUUID(),
    BCRYPT_COST,
  );

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly userClaimsService: UserClaimsService,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(RefreshTokenSessionEntity)
    private readonly sessionRepository: Repository<RefreshTokenSessionEntity>,
  ) {}

  async register({
    email,
    password,
  }: RegisterDto): Promise<{ id: string; email: string }> {
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    try {
      const user = await this.userRepository.save(
        this.userRepository.create({
          email: this.normalizeEmail(email),
          passwordHash,
          isActive: true,
        }),
      );

      return { id: user.id, email: user.email };
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === PG_UNIQUE_VIOLATION
      ) {
        throw new ConflictException('Email is already registered.');
      }
      throw error;
    }
  }

  async login({ email, password }: LoginDto): Promise<AuthTokenResponse> {
    const user = await this.userRepository.findOne({
      where: { email: this.normalizeEmail(email) },
    });

    const passwordMatches = await bcrypt.compare(
      password,
      user?.passwordHash ?? this.dummyPasswordHash,
    );

    if (!user?.passwordHash || !passwordMatches || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    return this.issueTokenPair(await this.buildAccessPayload(user.id));
  }

  async refresh({ refreshToken }: RefreshTokenDto): Promise<AuthTokenResponse> {
    const payload = await this.verifyRefreshToken(refreshToken);

    // Revoke and check the session in one statement so two concurrent
    // refreshes with the same token cannot both succeed.
    const result = await this.sessionRepository
      .createQueryBuilder()
      .update()
      .set({ revokedAt: () => 'now()' })
      .where('session_id = :sessionId', { sessionId: payload.sessionId })
      .andWhere('user_id = :userId', { userId: payload.sub })
      .andWhere('token_hash = :tokenHash', {
        tokenHash: this.hashToken(refreshToken),
      })
      .andWhere('revoked_at IS NULL')
      .andWhere('expires_at > now()')
      .execute();

    if (result.affected !== 1) {
      throw new UnauthorizedException('Refresh session is no longer valid.');
    }

    return this.issueTokenPair(await this.buildAccessPayload(payload.sub));
  }

  async logout({ refreshToken }: RefreshTokenDto): Promise<{ success: true }> {
    const payload = await this.verifyRefreshToken(refreshToken);

    await this.sessionRepository.update(
      {
        sessionId: payload.sessionId,
        userId: payload.sub,
        revokedAt: IsNull(),
      },
      { revokedAt: new Date() },
    );

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

  private async buildAccessPayload(
    userId: string,
  ): Promise<AccessTokenPayload> {
    const claims = await this.userClaimsService.loadClaims(userId);

    if (!claims?.isActive) {
      throw new UnauthorizedException('User is inactive or no longer exists.');
    }

    return {
      sub: claims.id,
      email: claims.email,
      globalRoles: claims.globalRoles,
      organizationRoles: claims.organizationRoles,
      permissions: claims.permissions,
      tokenType: 'access',
    };
  }

  private async issueTokenPair(
    accessPayload: AccessTokenPayload,
  ): Promise<AuthTokenResponse> {
    const refreshTokenExpiresIn = this.configService.getOrThrow<number>(
      'JWT_REFRESH_EXPIRES_IN_SECONDS',
    );

    const sessionId = randomUUID();
    const refreshPayload: RefreshTokenPayload = {
      sub: accessPayload.sub,
      tokenType: 'refresh',
      sessionId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshTokenExpiresIn,
      }),
    ]);

    await this.pruneSessions(accessPayload.sub);
    await this.sessionRepository.insert({
      sessionId,
      userId: accessPayload.sub,
      tokenHash: this.hashToken(refreshToken),
      expiresAt: new Date(Date.now() + refreshTokenExpiresIn * 1000),
      revokedAt: null,
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  /** Drops the user's sessions that can never be used again. */
  private async pruneSessions(userId: string): Promise<void> {
    await this.sessionRepository
      .createQueryBuilder()
      .delete()
      .where('user_id = :userId', { userId })
      .andWhere('(expires_at <= now() OR revoked_at IS NOT NULL)')
      .execute();
  }

  // Refresh tokens are long, high-entropy JWTs, so a fast hash is enough.
  // bcrypt would only see the first 72 bytes, which are nearly identical
  // across tokens.
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
