import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { QueryFailedError } from 'typeorm';
import { AuthService } from './auth.service';
import type { AccessTokenPayload } from './interfaces/token-payload.interface';

const ACCESS_SECRET = 'test-access-secret';
const REFRESH_SECRET = 'test-refresh-secret';
const PASSWORD = 'correct-horse-battery';

/** Chainable stand-in for a TypeORM query builder. */
function queryBuilderMock(affected: number) {
  const builder: Record<string, jest.Mock> = {};
  for (const method of ['update', 'delete', 'set', 'where', 'andWhere']) {
    builder[method] = jest.fn(() => builder);
  }
  builder.execute = jest.fn().mockResolvedValue({ affected });
  return builder;
}

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;
  let userRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let sessionRepository: {
    createQueryBuilder: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
  };
  let passwordHash: string;

  const storedUser = (overrides = {}) => ({
    id: 'user-1',
    email: 'user@example.com',
    passwordHash,
    isActive: true,
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
      findOne: jest.fn(),
      create: jest.fn((entity: object) => entity),
      save: jest.fn(),
    };
    sessionRepository = {
      createQueryBuilder: jest.fn(() => queryBuilderMock(1)),
      insert: jest.fn(),
      update: jest.fn(),
    };
    service = new AuthService(
      jwtService,
      configService,
      userRepository as never,
      sessionRepository as never,
    );
  });

  const decodeAccess = (token: string) =>
    jwtService.verify<AccessTokenPayload>(token, { secret: ACCESS_SECRET });

  describe('register', () => {
    it('stores a bcrypt hash and a normalized email, never the password', async () => {
      userRepository.save.mockImplementation((user: object) => ({
        id: 'user-1',
        ...user,
      }));

      const result = await service.register({
        email: '  New@Example.COM ',
        password: PASSWORD,
      });

      expect(result).toEqual({ id: 'user-1', email: 'new@example.com' });
      const saved = (userRepository.save.mock.calls as unknown[][])[0][0] as {
        passwordHash: string;
      };
      expect(saved.passwordHash).not.toBe(PASSWORD);
      await expect(bcrypt.compare(PASSWORD, saved.passwordHash)).resolves.toBe(
        true,
      );
    });

    it('maps a duplicate email to 409', async () => {
      userRepository.save.mockRejectedValue(
        new QueryFailedError('INSERT', [], { code: '23505' } as never),
      );

      await expect(
        service.register({ email: 'user@example.com', password: PASSWORD }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('rejects an unknown email', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: PASSWORD }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a wrong password', async () => {
      userRepository.findOne.mockResolvedValue(storedUser());

      await expect(
        service.login({
          email: 'user@example.com',
          password: 'wrong-password',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an inactive user even with the right password', async () => {
      userRepository.findOne.mockResolvedValue(storedUser({ isActive: false }));

      await expect(
        service.login({ email: 'user@example.com', password: PASSWORD }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a user without a password', async () => {
      userRepository.findOne.mockResolvedValue(
        storedUser({ passwordHash: null }),
      );

      await expect(
        service.login({ email: 'user@example.com', password: PASSWORD }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('issues an identity-only access token and stores only a hash of the refresh token', async () => {
      userRepository.findOne.mockResolvedValue(storedUser());

      const { accessToken, refreshToken } = await service.login({
        email: 'USER@example.com',
        password: PASSWORD,
      });

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
      });
      const access = decodeAccess(accessToken);
      expect(access).toMatchObject({
        sub: 'user-1',
        email: 'user@example.com',
        tokenType: 'access',
      });
      // Permissions are resolved per request, never baked into the token.
      expect(access).not.toHaveProperty('permissions');
      expect(access).not.toHaveProperty('globalRoles');

      const session = (
        sessionRepository.insert.mock.calls as unknown[][]
      )[0][0] as {
        tokenHash: string;
        userId: string;
      };
      expect(session.userId).toBe('user-1');
      expect(session.tokenHash).toBe(
        createHash('sha256').update(refreshToken).digest('hex'),
      );
    });
  });

  describe('refresh', () => {
    const loginAndGetRefreshToken = async () => {
      userRepository.findOne.mockResolvedValue(storedUser());
      return (
        await service.login({ email: 'user@example.com', password: PASSWORD })
      ).refreshToken;
    };

    it('reloads the user from the DB by id', async () => {
      const refreshToken = await loginAndGetRefreshToken();
      userRepository.findOne.mockResolvedValue(
        storedUser({ email: 'renamed@example.com' }),
      );

      const { accessToken } = await service.refresh({ refreshToken });

      expect(userRepository.findOne).toHaveBeenLastCalledWith({
        where: { id: 'user-1' },
      });
      expect(decodeAccess(accessToken).email).toBe('renamed@example.com');
    });

    it('rejects a token whose session was already rotated or revoked', async () => {
      const refreshToken = await loginAndGetRefreshToken();
      sessionRepository.createQueryBuilder.mockReturnValue(queryBuilderMock(0));

      await expect(service.refresh({ refreshToken })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a user who was deactivated after login', async () => {
      const refreshToken = await loginAndGetRefreshToken();
      userRepository.findOne.mockResolvedValue(storedUser({ isActive: false }));

      await expect(service.refresh({ refreshToken })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects an access token', async () => {
      userRepository.findOne.mockResolvedValue(storedUser());
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
      userRepository.findOne.mockResolvedValue(storedUser());
      const { refreshToken } = await service.login({
        email: 'user@example.com',
        password: PASSWORD,
      });

      await expect(service.logout({ refreshToken })).resolves.toEqual({
        success: true,
      });
      expect(sessionRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1' }),
        { revokedAt: expect.any(Date) as Date },
      );
    });
  });
});
