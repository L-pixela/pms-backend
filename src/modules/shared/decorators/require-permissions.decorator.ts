import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../constants/permissions';

export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';

/**
 * The caller needs every listed permission. On routes with an
 * `:organizationId` param they are checked in that organization.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
