import { RoleScope } from '../domain/role';

/**
 * Every permission the code checks. Permissions are fixed in code because a
 * route can only enforce what it knows about; roles are data and are built
 * from these at runtime.
 */
export const Permissions = {
  USERS_READ: 'users.read',
  USERS_MANAGE: 'users.manage',
  ROLES_READ: 'roles.read',
  ROLES_MANAGE: 'roles.manage',
  ORGANIZATIONS_READ: 'organizations.read',
  ORGANIZATIONS_MANAGE: 'organizations.manage',
  PROPERTIES_READ: 'properties.read',
  PROPERTIES_MANAGE: 'properties.manage',
  LEASES_READ: 'leases.read',
  LEASES_MANAGE: 'leases.manage',
  PAYMENTS_READ: 'payments.read',
  PAYMENTS_MANAGE: 'payments.manage',
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

export interface PermissionDefinition {
  description: string;
  /** Role scopes allowed to hold the permission. */
  scopes: readonly RoleScope[];
}

const ANY_SCOPE = [RoleScope.GLOBAL, RoleScope.ORGANIZATION] as const;
const PLATFORM_ONLY = [RoleScope.GLOBAL] as const;

export const PERMISSION_CATALOG: Record<Permission, PermissionDefinition> = {
  [Permissions.USERS_READ]: {
    description: 'View user accounts across the platform',
    scopes: PLATFORM_ONLY,
  },
  [Permissions.USERS_MANAGE]: {
    description: 'Create, update and deactivate user accounts',
    scopes: PLATFORM_ONLY,
  },
  [Permissions.ROLES_READ]: {
    description: 'View roles and role assignments',
    scopes: ANY_SCOPE,
  },
  [Permissions.ROLES_MANAGE]: {
    description: 'Create, update and delete roles, and assign them',
    scopes: ANY_SCOPE,
  },
  [Permissions.ORGANIZATIONS_READ]: {
    description: 'View organization details',
    scopes: ANY_SCOPE,
  },
  [Permissions.ORGANIZATIONS_MANAGE]: {
    description: 'Update organization details and members',
    scopes: ANY_SCOPE,
  },
  [Permissions.PROPERTIES_READ]: {
    description: 'View properties',
    scopes: ANY_SCOPE,
  },
  [Permissions.PROPERTIES_MANAGE]: {
    description: 'Create, update and delete properties',
    scopes: ANY_SCOPE,
  },
  [Permissions.LEASES_READ]: {
    description: 'View leases',
    scopes: ANY_SCOPE,
  },
  [Permissions.LEASES_MANAGE]: {
    description: 'Create, update and terminate leases',
    scopes: ANY_SCOPE,
  },
  [Permissions.PAYMENTS_READ]: {
    description: 'View payments',
    scopes: ANY_SCOPE,
  },
  [Permissions.PAYMENTS_MANAGE]: {
    description: 'Record and update payments',
    scopes: ANY_SCOPE,
  },
};

export const ALL_PERMISSIONS = Object.values(Permissions);

export function isPermission(key: string): key is Permission {
  return Object.hasOwn(PERMISSION_CATALOG, key);
}

export function isAssignableToScope(
  permission: Permission,
  scope: RoleScope,
): boolean {
  return PERMISSION_CATALOG[permission].scopes.includes(scope);
}
