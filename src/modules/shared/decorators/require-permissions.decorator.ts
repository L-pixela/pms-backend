import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiExtension, ApiForbiddenResponse } from '@nestjs/swagger';
import type { Permission } from '../constants/permissions';
import { ErrorResponseDto } from '../dto/error-response.dto';

export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';

/**
 * The caller needs every listed permission. On routes with an
 * `:organizationId` param they are checked in that organization.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  applyDecorators(
    SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions),
    ApiExtension('x-required-permissions', permissions),
    ApiForbiddenResponse({
      description: `Missing permission: ${permissions.join(', ')}`,
      type: ErrorResponseDto,
    }),
  );
