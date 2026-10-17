import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  REQUIRED_ROLES_KEY,
  RoleRequirements,
} from '../decorators/require-roles.decorator';
import type { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';

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

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const { user } = request;

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
      const organizationId = this.resolveOrganizationId(request);

      if (!organizationId) {
        return false;
      }

      // The id comes from the client, so never let it resolve to an
      // inherited key such as "constructor" or "__proto__".
      const userOrganizationRoles = Object.hasOwn(
        user.organizationRoles,
        organizationId,
      )
        ? user.organizationRoles[organizationId]
        : undefined;

      if (!Array.isArray(userOrganizationRoles)) {
        return false;
      }

      const hasOrganizationRole = requirements.organization.some((role) =>
        userOrganizationRoles.includes(role),
      );

      if (!hasOrganizationRole) {
        return false;
      }
    }

    return true;
  }

  /**
   * The `:organizationId` route param is the org the handler acts on, so it is
   * authoritative. The `x-organization-id` header is only a fallback for routes
   * without that param, and must agree with it when both are sent.
   */
  private resolveOrganizationId(
    request: AuthenticatedRequest,
  ): string | undefined {
    const organizationIdFromHeader = this.firstValue(
      request.headers['x-organization-id'],
    );
    const organizationIdFromParam = this.firstValue(
      request.params?.organizationId,
    );

    if (!organizationIdFromParam) {
      return organizationIdFromHeader;
    }

    if (
      organizationIdFromHeader !== undefined &&
      organizationIdFromHeader !== organizationIdFromParam
    ) {
      throw new ForbiddenException('Organization context mismatch.');
    }

    return organizationIdFromParam;
  }

  private firstValue(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }
}
