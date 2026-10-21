import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import type {
  IRoleAssignmentRepository,
  OrganizationRoles,
} from '../../../modules/roles/repositories/role-assignment.repository.interface';
import type { Role, RoleScope } from '../../../modules/shared/domain/role';
import { OrganizationMembershipRoleEntity } from '../entities/organization-membership-role.entity';
import { OrganizationMembershipEntity } from '../entities/organization-membership.entity';
import { UserGlobalRoleEntity } from '../entities/user-global-role.entity';
import { toRole } from '../mappers';

interface OrganizationRoleRow {
  organizationId: string;
  id: string | null;
  key: string;
  name: string;
  description: string | null;
  scope: RoleScope;
  roleOrganizationId: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class TypeOrmRoleAssignmentRepository implements IRoleAssignmentRepository {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(UserGlobalRoleEntity)
    private readonly userGlobalRoleRepository: Repository<UserGlobalRoleEntity>,
    @InjectRepository(OrganizationMembershipEntity)
    private readonly membershipRepository: Repository<OrganizationMembershipEntity>,
    @InjectRepository(OrganizationMembershipRoleEntity)
    private readonly membershipRoleRepository: Repository<OrganizationMembershipRoleEntity>,
  ) {}

  async listGlobalRoleIds(userId: string): Promise<string[]> {
    const rows = await this.userGlobalRoleRepository.find({
      where: { userId },
    });
    return rows.map((row) => row.roleId);
  }

  async listGlobalRoles(userId: string): Promise<Role[]> {
    const rows = await this.userGlobalRoleRepository.find({
      where: { userId },
      relations: { role: true },
      order: { role: { key: 'ASC' } },
    });
    return rows.map((row) => toRole(row.role));
  }

  async replaceGlobalRoles(
    userId: string,
    added: string[],
    removed: string[],
  ): Promise<void> {
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
  }

  async listMembershipRoleIds(membershipId: string): Promise<string[]> {
    const rows = await this.membershipRoleRepository.find({
      where: { membershipId },
    });
    return rows.map((row) => row.roleId);
  }

  async listMembershipRoles(membershipId: string): Promise<Role[]> {
    const rows = await this.membershipRoleRepository.find({
      where: { membershipId },
      relations: { role: true },
      order: { role: { key: 'ASC' } },
    });
    return rows.map((row) => toRole(row.role));
  }

  async replaceMembershipRoles(
    membershipId: string,
    added: string[],
    removed: string[],
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      if (removed.length) {
        await manager.delete(OrganizationMembershipRoleEntity, {
          membershipId,
          roleId: In(removed),
        });
      }
      if (added.length) {
        await manager.insert(
          OrganizationMembershipRoleEntity,
          added.map((roleId) => ({ membershipId, roleId })),
        );
      }
    });
  }

  async listUserOrganizationRoles(
    userId: string,
  ): Promise<OrganizationRoles[]> {
    const rows = await this.membershipRepository
      .createQueryBuilder('membership')
      // Soft-deleted organizations drop out of the caller's view.
      .innerJoin('membership.organization', 'organization')
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
      .addSelect('role.description', 'description')
      .addSelect('role.scope', 'scope')
      .addSelect('role.organizationId', 'roleOrganizationId')
      .addSelect('role.isSystem', 'isSystem')
      .addSelect('role.createdAt', 'createdAt')
      .addSelect('role.updatedAt', 'updatedAt')
      .where('membership.userId = :userId', { userId })
      .andWhere('organization.deletedAt IS NULL')
      .orderBy('membership.createdAt')
      .addOrderBy('role.key')
      .getRawMany<OrganizationRoleRow>();

    const organizations = new Map<string, Role[]>();
    for (const row of rows) {
      const roles = organizations.get(row.organizationId) ?? [];
      organizations.set(row.organizationId, roles);
      // A membership without roles still shows up, with an empty list.
      if (row.id) {
        roles.push({
          id: row.id,
          key: row.key,
          name: row.name,
          description: row.description,
          scope: row.scope,
          organizationId: row.roleOrganizationId,
          isSystem: row.isSystem,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        });
      }
    }

    return [...organizations].map(([organizationId, roles]) => ({
      organizationId,
      roles,
    }));
  }
}
