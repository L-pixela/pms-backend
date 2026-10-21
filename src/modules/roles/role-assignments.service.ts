import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MEMBERSHIP_REPOSITORY,
  type IMembershipRepository,
} from '../organizations/repositories/membership.repository.interface';
import type { OrganizationMembership } from '../organizations/domain/organization-membership';
import { RoleScope, type Role } from '../shared/domain/role';
import {
  ROLE_REPOSITORY,
  type IRoleRepository,
  type RoleCriteria,
} from '../shared/repositories/role.repository.interface';
import { AccessControlService } from '../shared/services/access-control.service';
import {
  USER_REPOSITORY,
  type IUserRepository,
} from '../users/repositories/user.repository.interface';
import {
  ROLE_ASSIGNMENT_REPOSITORY,
  type IRoleAssignmentRepository,
} from './repositories/role-assignment.repository.interface';
import { RolesService } from './roles.service';

export interface RoleSummary {
  id: string;
  key: string;
  name: string;
  scope: RoleScope;
  organizationId: string | null;
}

export interface MembershipRoles {
  organizationId: string;
  roles: RoleSummary[];
}

/** Who holds which role, globally and per organization membership. */
@Injectable()
export class RoleAssignmentsService {
  constructor(
    @Inject(ROLE_REPOSITORY)
    private readonly roleRepository: IRoleRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepository: IMembershipRepository,
    @Inject(ROLE_ASSIGNMENT_REPOSITORY)
    private readonly roleAssignmentRepository: IRoleAssignmentRepository,
    private readonly rolesService: RolesService,
    private readonly accessControlService: AccessControlService,
  ) {}

  async getUserGlobalRoles(userId: string): Promise<RoleSummary[]> {
    await this.assertUserExists(userId);
    return this.loadGlobalRoles(userId);
  }

  async replaceUserGlobalRoles(
    callerId: string,
    userId: string,
    roleIds: string[],
  ): Promise<RoleSummary[]> {
    await this.assertUserExists(userId);
    await this.findAssignableRoles(roleIds, [
      { organizationId: null, scope: RoleScope.GLOBAL },
    ]);

    const current =
      await this.roleAssignmentRepository.listGlobalRoleIds(userId);
    const { added, removed } = this.diff(current, roleIds);
    await this.assertCanChange(callerId, null, [...added, ...removed]);

    await this.roleAssignmentRepository.replaceGlobalRoles(
      userId,
      added,
      removed,
    );

    return this.loadGlobalRoles(userId);
  }

  async getMemberRoles(
    organizationId: string,
    userId: string,
  ): Promise<RoleSummary[]> {
    const membership = await this.findMembership(organizationId, userId);
    return this.loadMembershipRoles(membership.id);
  }

  async replaceMemberRoles(
    callerId: string,
    organizationId: string,
    userId: string,
    roleIds: string[],
  ): Promise<RoleSummary[]> {
    const membership = await this.findMembership(organizationId, userId);
    // Platform templates or this org's own roles; never another org's.
    await this.findAssignableRoles(roleIds, [
      { organizationId: null, scope: RoleScope.ORGANIZATION },
      { organizationId },
    ]);

    const current = await this.roleAssignmentRepository.listMembershipRoleIds(
      membership.id,
    );
    const { added, removed } = this.diff(current, roleIds);
    await this.assertCanChange(callerId, organizationId, [
      ...added,
      ...removed,
    ]);

    await this.roleAssignmentRepository.replaceMembershipRoles(
      membership.id,
      added,
      removed,
    );

    return this.loadMembershipRoles(membership.id);
  }

  /**
   * Checks that `roleIds` can be given to a member of the organization (a
   * platform template or one of its own roles) and that the caller holds every
   * permission they carry.
   */
  async assertCanAssignMemberRoles(
    callerId: string,
    organizationId: string,
    roleIds: string[],
  ): Promise<void> {
    await this.findAssignableRoles(roleIds, [
      { organizationId: null, scope: RoleScope.ORGANIZATION },
      { organizationId },
    ]);
    await this.assertCanChange(callerId, organizationId, roleIds);
  }

  /** Checks that the caller holds every permission of the member's current roles. */
  async assertCanRevokeMemberRoles(
    callerId: string,
    organizationId: string,
    membershipId: string,
  ): Promise<void> {
    const current =
      await this.roleAssignmentRepository.listMembershipRoleIds(membershipId);
    await this.assertCanChange(callerId, organizationId, current);
  }

  /** The caller's global roles and their roles in each organization. */
  async describeUserRoles(userId: string): Promise<{
    globalRoles: RoleSummary[];
    organizations: MembershipRoles[];
  }> {
    const [globalRoles, memberships] = await Promise.all([
      this.loadGlobalRoles(userId),
      this.roleAssignmentRepository.listUserOrganizationRoles(userId),
    ]);

    return {
      globalRoles,
      organizations: memberships.map(({ organizationId, roles }) => ({
        organizationId,
        roles: roles.map((role) => this.toSummary(role)),
      })),
    };
  }

  private async findAssignableRoles(
    roleIds: string[],
    criteria: RoleCriteria[],
  ): Promise<Role[]> {
    if (!roleIds.length) {
      return [];
    }

    const roles = await this.roleRepository.findByIds(roleIds, criteria);

    if (roles.length !== roleIds.length) {
      const found = new Set(roles.map((role) => role.id));
      throw new BadRequestException(
        `Unknown or unassignable role(s): ${roleIds.filter((id) => !found.has(id)).join(', ')}.`,
      );
    }

    return roles;
  }

  /** Granting or revoking a role needs every permission it carries. */
  private async assertCanChange(
    callerId: string,
    organizationId: string | null,
    roleIds: string[],
  ): Promise<void> {
    if (!roleIds.length) {
      return;
    }

    const permissions = await this.rolesService.loadPermissionKeys(roleIds);
    await this.accessControlService.assertHoldsAll(
      callerId,
      organizationId,
      [...permissions.values()].flat(),
    );
  }

  private diff(current: string[], next: string[]) {
    const currentSet = new Set(current);
    const nextSet = new Set(next);
    return {
      added: next.filter((id) => !currentSet.has(id)),
      removed: current.filter((id) => !nextSet.has(id)),
    };
  }

  private async assertUserExists(userId: string): Promise<void> {
    if (!(await this.userRepository.exists(userId))) {
      throw new NotFoundException('User not found.');
    }
  }

  private async findMembership(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMembership> {
    await this.rolesService.assertOrganizationExists(organizationId);
    const membership =
      await this.membershipRepository.findByOrganizationAndUser(
        organizationId,
        userId,
      );

    if (!membership) {
      throw new NotFoundException('User is not a member of this organization.');
    }

    return membership;
  }

  private async loadGlobalRoles(userId: string): Promise<RoleSummary[]> {
    const roles = await this.roleAssignmentRepository.listGlobalRoles(userId);
    return roles.map((role) => this.toSummary(role));
  }

  private async loadMembershipRoles(
    membershipId: string,
  ): Promise<RoleSummary[]> {
    const roles =
      await this.roleAssignmentRepository.listMembershipRoles(membershipId);
    return roles.map((role) => this.toSummary(role));
  }

  private toSummary(role: Role): RoleSummary {
    return {
      id: role.id,
      key: role.key,
      name: role.name,
      scope: role.scope,
      organizationId: role.organizationId,
    };
  }
}
