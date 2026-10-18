import { RoleScope } from '../domain/role';
import { ALL_PERMISSIONS, Permission, Permissions } from './permissions';

/**
 * Keys of the roles the seed creates. Routes never check these; they exist so
 * the seed and tests can find the built-in roles.
 */
export const SystemRoles = {
  PLATFORM_ADMIN: 'platform_admin',
  PROPERTY_MANAGER: 'property_manager',
  TENANT: 'tenant',
  VIEWER: 'viewer',
} as const;

export type SystemRole = (typeof SystemRoles)[keyof typeof SystemRoles];

export interface SystemRoleDefinition {
  key: SystemRole;
  name: string;
  description: string;
  scope: RoleScope;
  permissions: readonly Permission[];
}

/**
 * System roles are owned by the seed: it keeps their permissions exactly in
 * sync with this list, and the API refuses to edit or delete them.
 */
export const SYSTEM_ROLE_DEFINITIONS: readonly SystemRoleDefinition[] = [
  {
    key: SystemRoles.PLATFORM_ADMIN,
    name: 'Platform Admin',
    description: 'Full access to the whole platform',
    scope: RoleScope.GLOBAL,
    permissions: ALL_PERMISSIONS,
  },
  {
    key: SystemRoles.PROPERTY_MANAGER,
    name: 'Property Manager',
    description: 'Manages an organization, its roles and its rentals',
    scope: RoleScope.ORGANIZATION,
    permissions: [
      Permissions.ROLES_READ,
      Permissions.ROLES_MANAGE,
      Permissions.ORGANIZATIONS_READ,
      Permissions.ORGANIZATIONS_MANAGE,
      Permissions.PROPERTIES_READ,
      Permissions.PROPERTIES_MANAGE,
      Permissions.LEASES_READ,
      Permissions.LEASES_MANAGE,
      Permissions.PAYMENTS_READ,
      Permissions.PAYMENTS_MANAGE,
    ],
  },
  {
    key: SystemRoles.TENANT,
    name: 'Tenant',
    description: 'Rents a property from the organization',
    scope: RoleScope.ORGANIZATION,
    permissions: [
      Permissions.ORGANIZATIONS_READ,
      Permissions.PROPERTIES_READ,
      Permissions.LEASES_READ,
      Permissions.PAYMENTS_READ,
    ],
  },
  {
    key: SystemRoles.VIEWER,
    name: 'Viewer',
    description: 'Read-only access to the organization and its properties',
    scope: RoleScope.ORGANIZATION,
    permissions: [Permissions.ORGANIZATIONS_READ, Permissions.PROPERTIES_READ],
  },
];
