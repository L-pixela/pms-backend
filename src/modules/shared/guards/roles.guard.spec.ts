import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { buildUser, createHttpContext } from '../../../test-utils/http-context';
import type { RoleRequirements } from '../decorators/require-roles.decorator';
import { GlobalRole } from '../enums/global-role.enum';
import { OrganizationRole } from '../enums/organization-role.enum';
import { RolesGuard } from './roles.guard';

const ORG_A = '11111111-1111-1111-1111-111111111111';
const ORG_B = '22222222-2222-2222-2222-222222222222';

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  const requireRoles = (requirements: RoleRequirements | undefined) =>
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requirements);

  const managerOfOrgA = buildUser({
    organizationRoles: { [ORG_A]: [OrganizationRole.PROPERTY_MANAGER] },
  });

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('allows routes without role requirements', () => {
    requireRoles(undefined);
    expect(guard.canActivate(createHttpContext())).toBe(true);
  });

  it('throws 401 when there is no authenticated user', () => {
    requireRoles({ global: [GlobalRole.PLATFORM_ADMIN] });
    expect(() => guard.canActivate(createHttpContext())).toThrow(
      UnauthorizedException,
    );
  });

  describe('global roles', () => {
    beforeEach(() => requireRoles({ global: [GlobalRole.PLATFORM_ADMIN] }));

    it('allows a user with the role', () => {
      const user = buildUser({ globalRoles: [GlobalRole.PLATFORM_ADMIN] });
      expect(guard.canActivate(createHttpContext({ user }))).toBe(true);
    });

    it('denies a user without the role', () => {
      expect(guard.canActivate(createHttpContext({ user: buildUser() }))).toBe(
        false,
      );
    });
  });

  describe('organization roles', () => {
    beforeEach(() =>
      requireRoles({ organization: [OrganizationRole.PROPERTY_MANAGER] }),
    );

    it('uses the route param', () => {
      const context = createHttpContext({
        user: managerOfOrgA,
        params: { organizationId: ORG_A },
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('falls back to the header when there is no route param', () => {
      const context = createHttpContext({
        user: managerOfOrgA,
        headers: { 'x-organization-id': ORG_A },
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('rejects a header that disagrees with the route param', () => {
      // Authorized for org A via the header while acting on org B.
      const context = createHttpContext({
        user: managerOfOrgA,
        headers: { 'x-organization-id': ORG_A },
        params: { organizationId: ORG_B },
      });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('denies a role held only in a different org', () => {
      const context = createHttpContext({
        user: managerOfOrgA,
        params: { organizationId: ORG_B },
      });
      expect(guard.canActivate(context)).toBe(false);
    });

    it('denies when no organization context is given', () => {
      expect(
        guard.canActivate(createHttpContext({ user: managerOfOrgA })),
      ).toBe(false);
    });

    it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])(
      'denies instead of throwing for the prototype key %p',
      (organizationId) => {
        const context = createHttpContext({
          user: managerOfOrgA,
          headers: { 'x-organization-id': organizationId },
        });
        expect(guard.canActivate(context)).toBe(false);
      },
    );
  });
});
