import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'node:crypto';
import { DuplicateKeyError } from '../database/errors';
import type { User } from '../modules/users/domain/user';
import {
  USER_REPOSITORY,
  type IUserRepository,
} from '../modules/users/repositories/user.repository.interface';
import type { LoginDto } from './dto/login.dto';
import type { RefreshTokenDto } from './dto/refresh-token.dto';
import type { RegisterDto } from './dto/register.dto';
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
} from './interfaces/token-payload.interface';
import {
  REFRESH_TOKEN_SESSION_REPOSITORY,
  type IRefreshTokenSessionRepository,
} from './repositories/refresh-token-session.repository.interface';
import type { AuthTokenResponse } from './types/auth-token-response.type';

const BCRYPT_COST = 12;

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
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(REFRESH_TOKEN_SESSION_REPOSITORY)
    private readonly sessionRepository: IRefreshTokenSessionRepository,
  ) {}

  async register({
    email,
    password,
  }: RegisterDto): Promise<{ id: string; email: string }> {
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    try {
      const user = await this.userRepository.create({
        email: this.normalizeEmail(email),
        passwordHash,
        isActive: true,
      });

      return { id: user.id, email: user.email };
    } catch (error) {
      if (error instanceof DuplicateKeyError) {
        throw new ConflictException('Email is already registered.');
      }
      throw error;
    }
  }

  async login({ email, password }: LoginDto): Promise<AuthTokenResponse> {
    const user = await this.userRepository.findByEmail(
      this.normalizeEmail(email),
    );

    const passwordMatches = await bcrypt.compare(
      password,
      user?.passwordHash ?? this.dummyPasswordHash,
    );

    if (!user?.passwordHash || !passwordMatches || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    return this.issueTokenPair(this.toAccessPayload(user));
  }

  async refresh({ refreshToken }: RefreshTokenDto): Promise<AuthTokenResponse> {
    const payload = await this.verifyRefreshToken(refreshToken);

    // Revoke and check the session in one statement so two concurrent
    // refreshes with the same token cannot both succeed.
    const revoked = await this.sessionRepository.revokeIfValid({
      sessionId: payload.sessionId,
      userId: payload.sub,
      tokenHash: this.hashToken(refreshToken),
    });

    if (!revoked) {
      throw new UnauthorizedException('Refresh session is no longer valid.');
    }

    return this.issueTokenPair(
      this.toAccessPayload(await this.loadActiveUser(payload.sub)),
    );
  }

  async logout({ refreshToken }: RefreshTokenDto): Promise<{ success: true }> {
    const payload = await this.verifyRefreshToken(refreshToken);

    await this.sessionRepository.revokeActive(payload.sessionId, payload.sub);

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

  private async loadActiveUser(userId: string): Promise<User> {
    const user = await this.userRepository.findById(userId);

    if (!user?.isActive) {
      throw new UnauthorizedException('User is inactive or no longer exists.');
    }

    return user;
  }

  private toAccessPayload(user: User): AccessTokenPayload {
    return { sub: user.id, email: user.email, tokenType: 'access' };
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

    // Drop the user's sessions that can never be used again.
    await this.sessionRepository.deleteUnusable(accessPayload.sub);
    await this.sessionRepository.create({
      sessionId,
      userId: accessPayload.sub,
      tokenHash: this.hashToken(refreshToken),
      expiresAt: new Date(Date.now() + refreshTokenExpiresIn * 1000),
    });

    return {
      accessToken,
      refreshToken,
    };
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
