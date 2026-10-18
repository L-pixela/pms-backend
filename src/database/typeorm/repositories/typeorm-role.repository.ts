import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  In,
  IsNull,
  Repository,
} from 'typeorm';
import { RoleScope, type Role } from '../../../modules/shared/domain/role';
import type {
  IRoleRepository,
  NewRole,
  RoleCriteria,
} from '../../../modules/shared/repositories/role.repository.interface';
import { DuplicateKeyError } from '../../errors';
import { OrganizationMembershipRoleEntity } from '../entities/organization-membership-role.entity';
import { PermissionEntity } from '../entities/permission.entity';
import { RolePermissionEntity } from '../entities/role-permission.entity';
import { RoleEntity } from '../entities/role.entity';
import { UserGlobalRoleEntity } from '../entities/user-global-role.entity';
import { toRole } from '../mappers';
import { isUniqueViolation } from '../postgres-errors';
import { BaseTypeOrmRepository } from './base-typeorm.repository';

@Injectable()
export class TypeOrmRoleRepository
  extends BaseTypeOrmRepository<RoleEntity, Role>
  implements IRoleRepository
{
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(RoleEntity) repository: Repository<RoleEntity>,
    @InjectRepository(RolePermissionEntity)
    private readonly rolePermissionRepository: Repository<RolePermissionEntity>,
  ) {
    super(repository);
  }

  protected toDomain(entity: RoleEntity): Role {
    return toRole(entity);
  }

  async listPlatform(scope?: RoleScope): Promise<Role[]> {
    const roles = await this.repository.find({
      where: { organizationId: IsNull(), ...(scope && { scope }) },
      order: { scope: 'ASC', key: 'ASC' },
    });
    return roles.map(toRole);
  }

  async listVisibleToOrganization(organizationId: string): Promise<Role[]> {
    const roles = await this.repository.find({
      where: [
        { organizationId: IsNull(), scope: RoleScope.ORGANIZATION },
        { organizationId },
      ],
      order: { key: 'ASC' },
    });
    return roles.map(toRole);
  }

  async findPlatform(roleId: string): Promise<Role | null> {
    const role = await this.repository.findOne({
      where: { id: roleId, organizationId: IsNull() },
    });
    return role ? toRole(role) : null;
  }

  async findVisibleToOrganization(
    organizationId: string,
    roleId: string,
  ): Promise<Role | null> {
    const role = await this.repository.findOne({
      where: [
        { id: roleId, organizationId: IsNull(), scope: RoleScope.ORGANIZATION },
        { id: roleId, organizationId },
      ],
    });
    return role ? toRole(role) : null;
  }

  async findByIds(ids: string[], criteria: RoleCriteria[]): Promise<Role[]> {
    if (!ids.length) {
      return [];
    }

    const roles = await this.repository.find({
      where: criteria.map(
        ({ organizationId, scope }): FindOptionsWhere<RoleEntity> => ({
          organizationId: organizationId === null ? IsNull() : organizationId,
          ...(scope && { scope }),
          id: In(ids),
        }),
      ),
    });
    return roles.map(toRole);
  }

  async create(role: NewRole, permissions: string[]): Promise<Role> {
    try {
      const created = await this.dataSource.transaction(async (manager) => {
        const saved = await manager.save(manager.create(RoleEntity, role));
        await this.replacePermissions(manager, saved.id, permissions);
        return saved;
      });
      return toRole(created);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateKeyError(`Role key "${role.key}" is already taken.`);
      }
      throw error;
    }
  }

  async update(
    roleId: string,
    changes: { name?: string; description?: string | null },
    permissions?: string[],
  ): Promise<Role> {
    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        RoleEntity,
        { id: roleId },
        {
          ...(changes.name !== undefined && { name: changes.name }),
          ...(changes.description !== undefined && {
            description: changes.description,
          }),
          // Also marks permission-only edits, and keeps the SET non-empty.
          updatedAt: () => 'now()',
        },
      );
      if (permissions) {
        await this.replacePermissions(manager, roleId, permissions);
      }
    });

    return toRole(await this.repository.findOneByOrFail({ id: roleId }));
  }

  async loadPermissionKeys(roleIds: string[]): Promise<Map<string, string[]>> {
    const byRole = new Map<string, string[]>();

    if (!roleIds.length) {
      return byRole;
    }

    const rows = await this.rolePermissionRepository
      .createQueryBuilder('rolePermission')
      .innerJoin('rolePermission.permission', 'permission')
      .select('rolePermission.roleId', 'roleId')
      .addSelect('permission.key', 'key')
      .where('rolePermission.roleId IN (:...roleIds)', { roleIds })
      .orderBy('permission.key')
      .getRawMany<{ roleId: string; key: string }>();

    for (const { roleId, key } of rows) {
      const keys = byRole.get(roleId) ?? [];
      keys.push(key);
      byRole.set(roleId, keys);
    }

    return byRole;
  }

  async countAssignments(roleId: string): Promise<number> {
    const [globalAssignments, memberAssignments] = await Promise.all([
      this.dataSource
        .getRepository(UserGlobalRoleEntity)
        .count({ where: { roleId } }),
      this.dataSource
        .getRepository(OrganizationMembershipRoleEntity)
        .count({ where: { roleId } }),
    ]);
    return globalAssignments + memberAssignments;
  }

  private async replacePermissions(
    manager: EntityManager,
    roleId: string,
    permissions: string[],
  ): Promise<void> {
    await manager.delete(RolePermissionEntity, { roleId });

    if (!permissions.length) {
      return;
    }

    const rows = await manager.find(PermissionEntity, {
      where: { key: In(permissions) },
    });

    if (rows.length !== permissions.length) {
      const seeded = new Set(rows.map((row) => row.key));
      const missing = permissions.filter((key) => !seeded.has(key));
      throw new Error(
        `Permissions missing from the database (run \`npm run seed\`): ${missing.join(', ')}`,
      );
    }

    await manager.insert(
      RolePermissionEntity,
      rows.map((permission) => ({ roleId, permissionId: permission.id })),
    );
  }
}
