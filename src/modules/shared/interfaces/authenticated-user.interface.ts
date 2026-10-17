import type { GlobalRole } from '../enums/global-role.enum';
import type { OrganizationRole } from '../enums/organization-role.enum';

export interface AuthenticatedUser {
  id: string;
  email: string;
  globalRoles: GlobalRole[];
  organizationRoles: Record<string, OrganizationRole[]>;
  permissions: string[];
}
