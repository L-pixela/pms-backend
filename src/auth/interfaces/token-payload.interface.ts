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

export interface RefreshTokenPayload {
  sub: string;
  email: string;
  globalRoles: GlobalRole[];
  organizationRoles: Record<string, OrganizationRole[]>;
  permissions: string[];
  tokenType: 'refresh';
  sessionId: string;
}
