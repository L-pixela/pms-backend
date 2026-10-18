import type { IRepository } from '../../../database/repository.interface';
import type { Role, RoleScope } from '../domain/role';

export interface RoleCriteria {
  organizationId: string | null;
  scope?: RoleScope;
}

export interface NewRole {
  key: string;
  name: string;
  description: string | null;
  scope: RoleScope;
  organizationId: string | null;
  isSystem: boolean;
}

export interface IRoleRepository extends IRepository<Role> {
  listPlatform(scope?: RoleScope): Promise<Role[]>;
  /** The platform organization-scoped templates plus the org's own roles. */
  listVisibleToOrganization(organizationId: string): Promise<Role[]>;
  findPlatform(roleId: string): Promise<Role | null>;
  findVisibleToOrganization(
    organizationId: string,
    roleId: string,
  ): Promise<Role | null>;
  /** Roles with one of the ids that match any of the criteria. */
  findByIds(ids: string[], criteria: RoleCriteria[]): Promise<Role[]>;

  /**
   * Creates the role and its permissions atomically.
   * @throws DuplicateKeyError when the key is taken.
   * @throws Error when a permission is not seeded.
   */
  create(role: NewRole, permissions: string[]): Promise<Role>;

  /**
   * Updates the role (always bumping `updatedAt`) and, when given, replaces
   * its permissions, atomically.
   */
  update(
    roleId: string,
    changes: { name?: string; description?: string | null },
    permissions?: string[],
  ): Promise<Role>;

  /** Permission keys per role id, sorted by key. Roles without any are absent. */
  loadPermissionKeys(roleIds: string[]): Promise<Map<string, string[]>>;
  /** How many users / memberships hold the role. */
  countAssignments(roleId: string): Promise<number>;
}

export const ROLE_REPOSITORY = Symbol('ROLE_REPOSITORY');
