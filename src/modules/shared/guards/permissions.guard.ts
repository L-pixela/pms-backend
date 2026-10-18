import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '../constants/permissions';
import { REQUIRED_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import type { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import { resolveOrganizationId } from '../organization-context';
import { AccessControlService } from '../services/access-control.service';

/**
 * Allows the request when the caller holds every required permission in the
 * route's organization (`:organizationId`), or platform-wide when the route
 * has no organization.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessControlService: AccessControlService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<
      Permission[] | undefined
    >(REQUIRED_PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

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
      resolveOrganizationId(request),
    );

    return requiredPermissions.every((permission) => granted.has(permission));
  }
}
