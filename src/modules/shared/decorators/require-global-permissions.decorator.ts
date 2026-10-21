import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiExtension, ApiForbiddenResponse } from '@nestjs/swagger';
import type { Permission } from '../constants/permissions';
import { ErrorResponseDto } from '../dto/error-response.dto';

export const REQUIRED_GLOBAL_PERMISSIONS_KEY = 'requiredGlobalPermissions';

/**
 * The caller needs every listed permission through a global role, even on a
 * route with an `:organizationId` param (the param is not resolved, so
 * organization roles never count). Takes precedence over
 * `@RequirePermissions` on the same route.
 */
export const RequireGlobalPermissions = (...permissions: Permission[]) =>
  applyDecorators(
    SetMetadata(REQUIRED_GLOBAL_PERMISSIONS_KEY, permissions),
    ApiExtension('x-required-permissions', permissions),
    ApiExtension('x-permission-scope', 'global'),
    ApiForbiddenResponse({
      description: `Missing global permission: ${permissions.join(', ')}`,
      type: ErrorResponseDto,
    }),
  );
