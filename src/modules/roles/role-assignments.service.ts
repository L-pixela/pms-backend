import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, In, IsNull, Repository } from 'typeorm';
import { OrganizationMembershipRoleEntity } from '../organizations/entities/organization-membership-role.entity';
import { OrganizationMembershipEntity } from '../organizations/entities/organization-membership.entity';
import { RoleEntity, RoleScope } from '../shared/entities/role.entity';
import { AccessControlService } from '../shared/services/access-control.service';
import { UserGlobalRoleEntity } from '../users/entities/user-global-role.entity';
import { UserEntity } from '../users/entities/user.entity';
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
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(RoleEntity)
    private readonly roleRepository: Repository<RoleEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(UserGlobalRoleEntity)
    private readonly userGlobalRoleRepository: Repository<UserGlobalRoleEntity>,
    @InjectRepository(OrganizationMembershipEntity)
    private readonly membershipRepository: Repository<OrganizationMembershipEntity>,
    @InjectRepository(OrganizationMembershipRoleEntity)
    private readonly membershipRoleRepository: Repository<OrganizationMembershipRoleEntity>,
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
    await this.findAssignableRoles(roleIds, {
      organizationId: IsNull(),
      scope: RoleScope.GLOBAL,
    });

    const current = await this.userGlobalRoleRepository.find({
      where: { userId },
    });
    const { added, removed } = this.diff(
      current.map((row) => row.roleId),
      roleIds,
    );
    await this.assertCanChange(callerId, null, [...added, ...removed]);

    await this.dataSource.transaction(async (manager) => {
      if (removed.length) {
        await manager.delete(UserGlobalRoleEntity, {
          userId,
          roleId: In(removed),
        });
      }
      if (added.length) {
        await manager.insert(
          UserGlobalRoleEntity,
          added.map((roleId) => ({ userId, roleId })),
        );
      }
    });

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
      { organizationId: IsNull(), scope: RoleScope.ORGANIZATION },
      { organizationId },
    ]);

    const current = await this.membershipRoleRepository.find({
      where: { membershipId: membership.id },
    });
    const { added, removed } = this.diff(
      current.map((row) => row.roleId),
      roleIds,
    );
    await this.assertCanChange(callerId, organizationId, [
      ...added,
      ...removed,
    ]);

    await this.dataSource.transaction(async (manager) => {
      if (removed.length) {
        await manager.delete(OrganizationMembershipRoleEntity, {
          membershipId: membership.id,
          roleId: In(removed),
        });
      }
      if (added.length) {
        await manager.insert(
          OrganizationMembershipRoleEntity,
          added.map((roleId) => ({ membershipId: membership.id, roleId })),
        );
      }
    });

    return this.loadMembershipRoles(membership.id);
  }

  /** The caller's global roles and their roles in each organization. */
  async describeUserRoles(userId: string): Promise<{
    globalRoles: RoleSummary[];
    organizations: MembershipRoles[];
  }> {
    const [globalRoles, rows] = await Promise.all([
      this.loadGlobalRoles(userId),
      this.membershipRepository
        .createQueryBuilder('membership')
        .leftJoin(
          OrganizationMembershipRoleEntity,
          'membershipRole',
          'membershipRole.membershipId = membership.id',
        )
        .leftJoin('membershipRole.role', 'role')
        .select('membership.organizationId', 'organizationId')
        .addSelect('role.id', 'id')
        .addSelect('role.key', 'key')
        .addSelect('role.name', 'name')
        .addSelect('role.scope', 'scope')
        .addSelect('role.organizationId', 'roleOrganizationId')
        .where('membership.userId = :userId', { userId })
        .orderBy('membership.createdAt')
        .addOrderBy('role.key')
        .getRawMany<{
          organizationId: string;
          id: string | null;
          key: string;
          name: string;
          scope: RoleScope;
          roleOrganizationId: string | null;
        }>(),
    ]);

    const organizations = new Map<string, RoleSummary[]>();
    for (const row of rows) {
      const roles = organizations.get(row.organizationId) ?? [];
      organizations.set(row.organizationId, roles);
      // A membership without roles still shows up, with an empty list.
      if (row.id) {
        roles.push({
          id: row.id,
          key: row.key,
          name: row.name,
          scope: row.scope,
          organizationId: row.roleOrganizationId,
        });
      }
    }

    return {
      globalRoles,
      organizations: [...organizations].map(([organizationId, roles]) => ({
        organizationId,
        roles,
      })),
    };
  }

  private async findAssignableRoles(
    roleIds: string[],
    where: FindOptionsWhere<RoleEntity> | FindOptionsWhere<RoleEntity>[],
  ): Promise<RoleEntity[]> {
    if (!roleIds.length) {
      return [];
    }

    const scopes = Array.isArray(where) ? where : [where];
    const roles = await this.roleRepository.find({
      where: scopes.map((scope) => ({ ...scope, id: In(roleIds) })),
    });

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
    if (!(await this.userRepository.exists({ where: { id: userId } }))) {
      throw new NotFoundException('User not found.');
    }
  }

  private async findMembership(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMembershipEntity> {
    await this.rolesService.assertOrganizationExists(organizationId);
    const membership = await this.membershipRepository.findOne({
      where: { organizationId, userId },
    });

    if (!membership) {
      throw new NotFoundException('User is not a member of this organization.');
    }

    return membership;
  }

  private async loadGlobalRoles(userId: string): Promise<RoleSummary[]> {
    const rows = await this.userGlobalRoleRepository.find({
      where: { userId },
      relations: { role: true },
      order: { role: { key: 'ASC' } },
    });
    return rows.map((row) => this.toSummary(row.role));
  }

  private async loadMembershipRoles(
    membershipId: string,
  ): Promise<RoleSummary[]> {
    const rows = await this.membershipRoleRepository.find({
      where: { membershipId },
      relations: { role: true },
      order: { role: { key: 'ASC' } },
    });
    return rows.map((row) => this.toSummary(row.role));
  }

  private toSummary(role: RoleEntity): RoleSummary {
    return {
      id: role.id,
      key: role.key,
      name: role.name,
      scope: role.scope,
      organizationId: role.organizationId,
    };
  }
}
