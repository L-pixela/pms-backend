import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { buildUser, createHttpContext } from '../../../test-utils/http-context';
import { Permission, Permissions } from '../constants/permissions';
import type { AccessControlService } from '../services/access-control.service';
import { PermissionsGuard } from './permissions.guard';

const ORG_ID = '4b0d7a8e-3c2f-4f7e-9d61-2a9c1b8e5f10';

describe('PermissionsGuard', () => {
  let reflector: Reflector;
  let accessControlService: { getEffectivePermissions: jest.Mock };
  let guard: PermissionsGuard;

  const requirePermissions = (permissions: Permission[] | undefined) =>
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(permissions);

  const grant = (...permissions: Permission[]) =>
    accessControlService.getEffectivePermissions.mockResolvedValue(
      new Set(permissions),
    );

  beforeEach(() => {
    reflector = new Reflector();
    accessControlService = {
      getEffectivePermissions: jest.fn().mockResolvedValue(new Set()),
    };
    guard = new PermissionsGuard(
      reflector,
      accessControlService as unknown as AccessControlService,
    );
  });

  it('allows routes without permission metadata without a DB lookup', async () => {
    requirePermissions(undefined);
    await expect(guard.canActivate(createHttpContext())).resolves.toBe(true);
    expect(accessControlService.getEffectivePermissions).not.toHaveBeenCalled();
  });

  it('throws 401 when there is no authenticated user', async () => {
    requirePermissions([Permissions.USERS_READ]);
    await expect(guard.canActivate(createHttpContext())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('allows a user holding every required permission', async () => {
    requirePermissions([Permissions.USERS_READ, Permissions.USERS_MANAGE]);
    grant(Permissions.USERS_READ, Permissions.USERS_MANAGE);
    const context = createHttpContext({ user: buildUser() });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('denies a user missing any required permission', async () => {
    requirePermissions([Permissions.USERS_READ, Permissions.USERS_MANAGE]);
    grant(Permissions.USERS_READ);
    const context = createHttpContext({ user: buildUser() });

    await expect(guard.canActivate(context)).resolves.toBe(false);
  });

  it('checks platform-wide permissions on routes without :organizationId', async () => {
    requirePermissions([Permissions.ROLES_READ]);
    await guard.canActivate(createHttpContext({ user: buildUser() }));

    expect(accessControlService.getEffectivePermissions).toHaveBeenCalledWith(
      'user-1',
      null,
    );
  });

  it('checks permissions in the :organizationId org', async () => {
    requirePermissions([Permissions.PROPERTIES_READ]);
    grant(Permissions.PROPERTIES_READ);
    const context = createHttpContext({
      user: buildUser(),
      params: { organizationId: ORG_ID },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(accessControlService.getEffectivePermissions).toHaveBeenCalledWith(
      'user-1',
      ORG_ID,
    );
  });

  it('ignores the x-organization-id header', async () => {
    requirePermissions([Permissions.PROPERTIES_READ]);
    const context = createHttpContext({
      user: buildUser(),
      headers: { 'x-organization-id': ORG_ID },
    });

    await guard.canActivate(context);
    expect(accessControlService.getEffectivePermissions).toHaveBeenCalledWith(
      'user-1',
      null,
    );
  });

  it('rejects a non-UUID :organizationId with 400 before querying', async () => {
    requirePermissions([Permissions.PROPERTIES_READ]);
    const context = createHttpContext({
      user: buildUser(),
      params: { organizationId: 'constructor' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      BadRequestException,
    );
    expect(accessControlService.getEffectivePermissions).not.toHaveBeenCalled();
  });
});
