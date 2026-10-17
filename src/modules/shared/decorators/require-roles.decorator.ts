import { SetMetadata } from '@nestjs/common';
import type { GlobalRole } from '../enums/global-role.enum';
import type { OrganizationRole } from '../enums/organization-role.enum';

export const REQUIRED_ROLES_KEY = 'requiredRoles';

export interface RoleRequirements {
  global?: GlobalRole[];
  organization?: OrganizationRole[];
}

export const RequireRoles = (requirements: RoleRequirements) =>
  SetMetadata(REQUIRED_ROLES_KEY, requirements);
