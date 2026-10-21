import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '../constants/permissions';
import { REQUIRED_GLOBAL_PERMISSIONS_KEY } from '../decorators/require-global-permissions.decorator';
import { REQUIRED_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import type { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import { resolveOrganizationId } from '../organization-context';
import { AccessControlService } from '../services/access-control.service';

/**
 * Allows the request when the caller holds every required permission in the
 * route's organization (`:organizationId`), or platform-wide when the route
 * has no organization. `@RequireGlobalPermissions` always checks platform-wide,
 * whatever the route params.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessControlService: AccessControlService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const globalPermissions = this.reflector.getAllAndOverride<
      Permission[] | undefined
    >(REQUIRED_GLOBAL_PERMISSIONS_KEY, targets);
    const requiredPermissions =
      globalPermissions ??
      this.reflector.getAllAndOverride<Permission[] | undefined>(
        REQUIRED_PERMISSIONS_KEY,
        targets,
      );

    if (!requiredPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const { user } = request;

    if (!user) {
      throw new UnauthorizedException('Authentication is required.');
    }

    const granted = await this.accessControlService.getEffectivePermissions(
      user.id,
      globalPermissions ? null : resolveOrganizationId(request),
    );

    return requiredPermissions.every((permission) => granted.has(permission));
  }
}
