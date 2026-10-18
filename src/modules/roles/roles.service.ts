import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { isUniqueViolation } from '../../database/postgres-errors';
import { OrganizationMembershipRoleEntity } from '../organizations/entities/organization-membership-role.entity';
import { OrganizationEntity } from '../organizations/entities/organization.entity';
import {
  isAssignableToScope,
  isPermission,
  type Permission,
} from '../shared/constants/permissions';
import { PermissionEntity } from '../shared/entities/permission.entity';
import { RolePermissionEntity } from '../shared/entities/role-permission.entity';
import { RoleEntity, RoleScope } from '../shared/entities/role.entity';
import { AccessControlService } from '../shared/services/access-control.service';
import { UserGlobalRoleEntity } from '../users/entities/user-global-role.entity';
import type {
  CreatePlatformRoleDto,
  CreateRoleDto,
} from './dto/create-role.dto';
import type { UpdateRoleDto } from './dto/update-role.dto';

export interface RoleView {
  id: string;
  key: string;
  name: string;
  description: string | null;
  scope: RoleScope;
  /** `null` for platform roles. */
  organizationId: string | null;
  isSystem: boolean;
  permissions: Permission[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Role CRUD. Platform roles (`organizationId = NULL`) are managed with
 * platform-wide permissions; custom org roles with permissions held in that
 * org. Every write passes the anti-escalation check.
 */
@Injectable()
export class RolesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(RoleEntity)
    private readonly roleRepository: Repository<RoleEntity>,
    @InjectRepository(RolePermissionEntity)
    private readonly rolePermissionRepository: Repository<RolePermissionEntity>,
    @InjectRepository(OrganizationEntity)
    private readonly organizationRepository: Repository<OrganizationEntity>,
    private readonly accessControlService: AccessControlService,
  ) {}

  async listPlatformRoles(scope?: RoleScope): Promise<RoleView[]> {
    const roles = await this.roleRepository.find({
      where: { organizationId: IsNull(), ...(scope && { scope }) },
      order: { scope: 'ASC', key: 'ASC' },
    });
    return this.toViews(roles);
  }

  /** The platform templates plus the org's own custom roles. */
  async listOrganizationRoles(organizationId: string): Promise<RoleView[]> {
    await this.assertOrganizationExists(organizationId);
    const roles = await this.roleRepository.find({
      where: [
        { organizationId: IsNull(), scope: RoleScope.ORGANIZATION },
        { organizationId },
      ],
      order: { key: 'ASC' },
    });
    return this.toViews(roles);
  }

  async getPlatformRole(roleId: string): Promise<RoleView> {
    return this.toView(await this.findPlatformRole(roleId));
  }

  async getOrganizationRole(
    organizationId: string,
    roleId: string,
  ): Promise<RoleView> {
    await this.assertOrganizationExists(organizationId);
    return this.toView(
      await this.findRoleVisibleToOrganization(organizationId, roleId),
    );
  }

  createPlatformRole(
    callerId: string,
    dto: CreatePlatformRoleDto,
  ): Promise<RoleView> {
    return this.createRole(callerId, null, dto.scope, dto);
  }

  async createOrganizationRole(
    callerId: string,
    organizationId: string,
    dto: CreateRoleDto,
  ): Promise<RoleView> {
    await this.assertOrganizationExists(organizationId);
    return this.createRole(
      callerId,
      organizationId,
      RoleScope.ORGANIZATION,
      dto,
    );
  }

  async updatePlatformRole(
    callerId: string,
    roleId: string,
    dto: UpdateRoleDto,
  ): Promise<RoleView> {
    const role = await this.findPlatformRole(roleId);
    return this.updateRole(callerId, null, role, dto);
  }

  async updateOrganizationRole(
    callerId: string,
    organizationId: string,
    roleId: string,
    dto: UpdateRoleDto,
  ): Promise<RoleView> {
    const role = await this.findCustomOrganizationRole(organizationId, roleId);
    return this.updateRole(callerId, organizationId, role, dto);
  }

  async deletePlatformRole(callerId: string, roleId: string): Promise<void> {
    const role = await this.findPlatformRole(roleId);
    await this.deleteRole(callerId, null, role);
  }

  async deleteOrganizationRole(
    callerId: string,
    organizationId: string,
    roleId: string,
  ): Promise<void> {
    const role = await this.findCustomOrganizationRole(organizationId, roleId);
    await this.deleteRole(callerId, organizationId, role);
  }

  /** Permission keys per role id; roles without permissions map to `[]`. */
  async loadPermissionKeys(
    roleIds: string[],
  ): Promise<Map<string, Permission[]>> {
    const byRole = new Map<string, Permission[]>(roleIds.map((id) => [id, []]));

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
      if (isPermission(key)) {
        byRole.get(roleId)?.push(key);
      }
    }

    return byRole;
  }

  async assertOrganizationExists(organizationId: string): Promise<void> {
    const exists = await this.organizationRepository.exists({
      where: { id: organizationId },
    });

    if (!exists) {
      throw new NotFoundException('Organization not found.');
    }
  }

  private async createRole(
    callerId: string,
    organizationId: string | null,
    scope: RoleScope,
    dto: CreateRoleDto,
  ): Promise<RoleView> {
    this.assertAssignable(dto.permissions, scope);
    await this.accessControlService.assertHoldsAll(
      callerId,
      organizationId,
      dto.permissions,
    );

    try {
      const role = await this.dataSource.transaction(async (manager) => {
        const created = await manager.save(
          manager.create(RoleEntity, {
            key: dto.key,
            name: dto.name,
            description: dto.description ?? null,
            scope,
            organizationId,
            isSystem: false,
          }),
        );
        await this.replacePermissions(manager, created.id, dto.permissions);
        return created;
      });

      return this.toView(role);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Role key "${dto.key}" is already taken.`);
      }
      throw error;
    }
  }

  private async updateRole(
    callerId: string,
    organizationId: string | null,
    role: RoleEntity,
    dto: UpdateRoleDto,
  ): Promise<RoleView> {
    this.assertNotSystem(role);

    const current = (await this.loadPermissionKeys([role.id])).get(role.id)!;
    if (dto.permissions) {
      this.assertAssignable(dto.permissions, role.scope);
    }
    await this.accessControlService.assertHoldsAll(callerId, organizationId, [
      ...current,
      ...(dto.permissions ?? []),
    ]);

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        RoleEntity,
        { id: role.id },
        {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          // Also marks permission-only edits, and keeps the SET non-empty.
          updatedAt: () => 'now()',
        },
      );
      if (dto.permissions) {
        await this.replacePermissions(manager, role.id, dto.permissions);
      }
    });

    return this.toView(
      await this.roleRepository.findOneByOrFail({ id: role.id }),
    );
  }

  private async deleteRole(
    callerId: string,
    organizationId: string | null,
    role: RoleEntity,
  ): Promise<void> {
    this.assertNotSystem(role);

    const current = (await this.loadPermissionKeys([role.id])).get(role.id)!;
    await this.accessControlService.assertHoldsAll(
      callerId,
      organizationId,
      current,
    );

    const [globalAssignments, memberAssignments] = await Promise.all([
      this.dataSource
        .getRepository(UserGlobalRoleEntity)
        .count({ where: { roleId: role.id } }),
      this.dataSource
        .getRepository(OrganizationMembershipRoleEntity)
        .count({ where: { roleId: role.id } }),
    ]);
    const assignments = globalAssignments + memberAssignments;

    if (assignments) {
      throw new ConflictException(
        `Role is still assigned ${assignments} time(s); unassign it first.`,
      );
    }

    await this.roleRepository.delete({ id: role.id });
  }

  private async replacePermissions(
    manager: EntityManager,
    roleId: string,
    permissions: Permission[],
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

  private async findPlatformRole(roleId: string): Promise<RoleEntity> {
    const role = await this.roleRepository.findOne({
      where: { id: roleId, organizationId: IsNull() },
    });

    if (!role) {
      throw new NotFoundException('Role not found.');
    }

    return role;
  }

  /** A platform template or one of the org's own roles, never another org's. */
  private async findRoleVisibleToOrganization(
    organizationId: string,
    roleId: string,
  ): Promise<RoleEntity> {
    const role = await this.roleRepository.findOne({
      where: [
        { id: roleId, organizationId: IsNull(), scope: RoleScope.ORGANIZATION },
        { id: roleId, organizationId },
      ],
    });

    if (!role) {
      throw new NotFoundException('Role not found.');
    }

    return role;
  }

  private async findCustomOrganizationRole(
    organizationId: string,
    roleId: string,
  ): Promise<RoleEntity> {
    await this.assertOrganizationExists(organizationId);
    const role = await this.findRoleVisibleToOrganization(
      organizationId,
      roleId,
    );

    if (role.organizationId === null) {
      throw new ForbiddenException(
        'Platform role templates can only be changed through /roles.',
      );
    }

    return role;
  }

  private assertNotSystem(role: RoleEntity): void {
    if (role.isSystem) {
      throw new ForbiddenException(
        'System roles are managed by the seed and cannot be changed.',
      );
    }
  }

  private assertAssignable(permissions: Permission[], scope: RoleScope): void {
    const invalid = permissions.filter(
      (permission) => !isAssignableToScope(permission, scope),
    );

    if (invalid.length) {
      throw new BadRequestException(
        `Not allowed on ${scope} roles: ${invalid.join(', ')}.`,
      );
    }
  }

  private async toView(role: RoleEntity): Promise<RoleView> {
    return (await this.toViews([role]))[0];
  }

  private async toViews(roles: RoleEntity[]): Promise<RoleView[]> {
    const permissions = await this.loadPermissionKeys(
      roles.map((role) => role.id),
    );

    return roles.map((role) => ({
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      scope: role.scope,
      organizationId: role.organizationId,
      isSystem: role.isSystem,
      permissions: permissions.get(role.id) ?? [],
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    }));
  }
}
