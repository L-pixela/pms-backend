import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  REQUIRED_ROLES_KEY,
  RoleRequirements,
} from '../decorators/require-roles.decorator';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requirements = this.reflector.getAllAndOverride<RoleRequirements>(
      REQUIRED_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requirements) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user) {
      throw new UnauthorizedException('Authentication is required.');
    }

    if (requirements.global?.length) {
      const hasGlobalRole = requirements.global.some((role) =>
        user.globalRoles.includes(role),
      );

      if (!hasGlobalRole) {
        return false;
      }
    }

    if (requirements.organization?.length) {
      const headerValue = request.headers['x-organization-id'];
      const organizationIdFromHeader = Array.isArray(headerValue)
        ? headerValue[0]
        : headerValue;
      const organizationId =
        organizationIdFromHeader ?? request.params?.organizationId;

      if (!organizationId) {
        return false;
      }

      const userOrganizationRoles =
        user.organizationRoles[organizationId] ?? [];
      const hasOrganizationRole = requirements.organization.some((role) =>
        userOrganizationRoles.includes(role),
      );

      if (!hasOrganizationRole) {
        return false;
      }
    }

    return true;
  }
}
