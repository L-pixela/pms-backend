export const Permissions = {
  USERS_READ: 'users.read',
  USERS_MANAGE: 'users.manage',
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
