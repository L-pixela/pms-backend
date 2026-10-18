export enum RoleScope {
  GLOBAL = 'global',
  ORGANIZATION = 'organization',
}

/**
 * A named set of permissions.
 *
 * - `organizationId = null`: a platform role. `scope = global` roles are held
 *   platform-wide; `scope = organization` roles are templates any org can
 *   assign to its members.
 * - `organizationId` set: a custom role that only that org can see or assign.
 *   It is always `scope = organization`.
 */
export interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  scope: RoleScope;
  organizationId: string | null;
  /** Seeded and kept in sync by the seed; read-only through the API. */
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}
