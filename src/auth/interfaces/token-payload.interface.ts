import type { GlobalRole } from '../../modules/shared/enums/global-role.enum';
import type { OrganizationRole } from '../../modules/shared/enums/organization-role.enum';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  globalRoles: GlobalRole[];
  organizationRoles: Record<string, OrganizationRole[]>;
  permissions: string[];
  tokenType: 'access';
}

/**
 * Carries no privileges: roles and permissions are reloaded from the
 * database on every refresh.
 */
export interface RefreshTokenPayload {
  sub: string;
  tokenType: 'refresh';
  sessionId: string;
}
