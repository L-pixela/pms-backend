import type { Role } from '../../shared/domain/role';

export interface OrganizationRoles {
  organizationId: string;
  roles: Role[];
}

export interface IRoleAssignmentRepository {
  listGlobalRoleIds(userId: string): Promise<string[]>;
  /** Sorted by role key. */
  listGlobalRoles(userId: string): Promise<Role[]>;
  /** Removes and adds in one transaction. */
  replaceGlobalRoles(
    userId: string,
    added: string[],
    removed: string[],
  ): Promise<void>;

  listMembershipRoleIds(membershipId: string): Promise<string[]>;
  /** Sorted by role key. */
  listMembershipRoles(membershipId: string): Promise<Role[]>;
  /** Removes and adds in one transaction. */
  replaceMembershipRoles(
    membershipId: string,
    added: string[],
    removed: string[],
  ): Promise<void>;

  /**
   * The user's roles per organization, in membership order, roles by key.
   * Memberships without roles are included with an empty list.
   */
  listUserOrganizationRoles(userId: string): Promise<OrganizationRoles[]>;
}

export const ROLE_ASSIGNMENT_REPOSITORY = Symbol('ROLE_ASSIGNMENT_REPOSITORY');
