/* eslint-disable @typescript-eslint/unbound-method */
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { DuplicateKeyError } from '../database/errors';
import type { User } from '../modules/users/domain/user';
import type { IUserRepository } from '../modules/users/repositories/user.repository.interface';
import { AuthService } from './auth.service';
import type { AccessTokenPayload } from './interfaces/token-payload.interface';
import type { IRefreshTokenSessionRepository } from './repositories/refresh-token-session.repository.interface';

const ACCESS_SECRET = 'test-access-secret';
const REFRESH_SECRET = 'test-refresh-secret';
const PASSWORD = 'correct-horse-battery';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;
  let userRepository: jest.Mocked<IUserRepository>;
  let sessionRepository: jest.Mocked<IRefreshTokenSessionRepository>;
  let passwordHash: string;

  const storedUser = (overrides: Partial<User> = {}): User => ({
    id: 'user-1',
    email: 'user@example.com',
    passwordHash,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 4);
  });

  beforeEach(() => {
    jwtService = new JwtService({
      secret: ACCESS_SECRET,
      signOptions: { expiresIn: 900 },
    });
    const configService = new ConfigService({
      JWT_REFRESH_SECRET: REFRESH_SECRET,
      JWT_REFRESH_EXPIRES_IN_SECONDS: 604800,
    });
    userRepository = {
      findById: jest.fn(),
      exists: jest.fn(),
      delete: jest.fn(),
      findByEmail: jest.fn(),
      create: jest.fn(),
    };
    sessionRepository = {
      create: jest.fn().mockResolvedValue(undefined),
      revokeIfValid: jest.fn().mockResolvedValue(true),
      revokeActive: jest.fn().mockResolvedValue(undefined),
      deleteUnusable: jest.fn().mockResolvedValue(undefined),
    };
    service = new AuthService(
      jwtService,
      configService,
      userRepository,
      sessionRepository,
    );
  });

  const decodeAccess = (token: string) =>
    jwtService.verify<AccessTokenPayload>(token, { secret: ACCESS_SECRET });

  describe('register', () => {
    it('stores a bcrypt hash and a normalized email, never the password', async () => {
      userRepository.create.mockImplementation((user) =>
        Promise.resolve(storedUser({ id: 'user-1', ...user })),
      );

      const result = await service.register({
        email: '  New@Example.COM ',
        password: PASSWORD,
      });

      expect(result).toEqual({ id: 'user-1', email: 'new@example.com' });
      const saved = userRepository.create.mock.calls[0][0];
      expect(saved.passwordHash).not.toBe(PASSWORD);
      await expect(bcrypt.compare(PASSWORD, saved.passwordHash)).resolves.toBe(
        true,
      );
    });

    it('maps a duplicate email to 409', async () => {
      userRepository.create.mockRejectedValue(new DuplicateKeyError());

      await expect(
        service.register({ email: 'user@example.com', password: PASSWORD }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('rejects an unknown email', async () => {
      userRepository.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: PASSWORD }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a wrong password', async () => {
      userRepository.findByEmail.mockResolvedValue(storedUser());

      await expect(
        service.login({
          email: 'user@example.com',
          password: 'wrong-password',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an inactive user even with the right password', async () => {
      userRepository.findByEmail.mockResolvedValue(
        storedUser({ isActive: false }),
      );

      await expect(
        service.login({ email: 'user@example.com', password: PASSWORD }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a user without a password', async () => {
      userRepository.findByEmail.mockResolvedValue(
        storedUser({ passwordHash: null }),
      );

      await expect(
        service.login({ email: 'user@example.com', password: PASSWORD }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('issues an identity-only access token and stores only a hash of the refresh token', async () => {
      userRepository.findByEmail.mockResolvedValue(storedUser());

      const { accessToken, refreshToken } = await service.login({
        email: 'USER@example.com',
        password: PASSWORD,
      });

      expect(userRepository.findByEmail).toHaveBeenCalledWith(
        'user@example.com',
      );
      const access = decodeAccess(accessToken);
      expect(access).toMatchObject({
        sub: 'user-1',
        email: 'user@example.com',
        tokenType: 'access',
      });
      // Permissions are resolved per request, never baked into the token.
      expect(access).not.toHaveProperty('permissions');
      expect(access).not.toHaveProperty('globalRoles');

      const session = sessionRepository.create.mock.calls[0][0];
      expect(session.userId).toBe('user-1');
      expect(session.tokenHash).toBe(
        createHash('sha256').update(refreshToken).digest('hex'),
      );
    });
  });

  describe('refresh', () => {
    const loginAndGetRefreshToken = async () => {
      userRepository.findByEmail.mockResolvedValue(storedUser());
      return (
        await service.login({ email: 'user@example.com', password: PASSWORD })
      ).refreshToken;
    };

    it('reloads the user from the DB by id', async () => {
      const refreshToken = await loginAndGetRefreshToken();
      userRepository.findById.mockResolvedValue(
        storedUser({ email: 'renamed@example.com' }),
      );

      const { accessToken } = await service.refresh({ refreshToken });

      expect(userRepository.findById).toHaveBeenLastCalledWith('user-1');
      expect(decodeAccess(accessToken).email).toBe('renamed@example.com');
    });

    it('rejects a token whose session was already rotated or revoked', async () => {
      const refreshToken = await loginAndGetRefreshToken();
      sessionRepository.revokeIfValid.mockResolvedValue(false);

      await expect(service.refresh({ refreshToken })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a user who was deactivated after login', async () => {
      const refreshToken = await loginAndGetRefreshToken();
      userRepository.findById.mockResolvedValue(
        storedUser({ isActive: false }),
      );

      await expect(service.refresh({ refreshToken })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects an access token', async () => {
      userRepository.findByEmail.mockResolvedValue(storedUser());
      const { accessToken } = await service.login({
        email: 'user@example.com',
        password: PASSWORD,
      });

      await expect(
        service.refresh({ refreshToken: accessToken }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('returns 401 (not 500) for a malformed token', async () => {
      await expect(
        service.logout({ refreshToken: 'not-a-jwt' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('revokes the session', async () => {
      userRepository.findByEmail.mockResolvedValue(storedUser());
      const { refreshToken } = await service.login({
        email: 'user@example.com',
        password: PASSWORD,
      });

      await expect(service.logout({ refreshToken })).resolves.toEqual({
        success: true,
      });
      expect(sessionRepository.revokeActive).toHaveBeenCalledWith(
        expect.any(String),
        'user-1',
      );
    });
  });
});
