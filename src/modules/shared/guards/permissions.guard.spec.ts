import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { buildUser, createHttpContext } from '../../../test-utils/http-context';
import { Permissions } from '../constants/permissions';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  let reflector: Reflector;
  let guard: PermissionsGuard;

  const requirePermissions = (permissions: string[] | undefined) =>
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(permissions);

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionsGuard(reflector);
  });

  it('allows routes without permission metadata', () => {
    requirePermissions(undefined);
    expect(guard.canActivate(createHttpContext())).toBe(true);
  });

  it('throws 401 when there is no authenticated user', () => {
    requirePermissions([Permissions.USERS_READ]);
    expect(() => guard.canActivate(createHttpContext())).toThrow(
      UnauthorizedException,
    );
  });

  it('allows a user holding every required permission', () => {
    requirePermissions([Permissions.USERS_READ, Permissions.USERS_MANAGE]);
    const user = buildUser({
      permissions: [Permissions.USERS_READ, Permissions.USERS_MANAGE],
    });
    expect(guard.canActivate(createHttpContext({ user }))).toBe(true);
  });

  it('denies a user missing any required permission', () => {
    requirePermissions([Permissions.USERS_READ, Permissions.USERS_MANAGE]);
    const user = buildUser({ permissions: [Permissions.USERS_READ] });
    expect(guard.canActivate(createHttpContext({ user }))).toBe(false);
  });
});
