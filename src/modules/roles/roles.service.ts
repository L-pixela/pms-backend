import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DuplicateKeyError } from '../../database/errors';
import {
  ORGANIZATION_REPOSITORY,
  type IOrganizationRepository,
} from '../organizations/repositories/organization.repository.interface';
import {
  isAssignableToScope,
  isPermission,
  type Permission,
} from '../shared/constants/permissions';
import { RoleScope, type Role } from '../shared/domain/role';
import {
  ROLE_REPOSITORY,
  type IRoleRepository,
} from '../shared/repositories/role.repository.interface';
import { AccessControlService } from '../shared/services/access-control.service';
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
    @Inject(ROLE_REPOSITORY)
    private readonly roleRepository: IRoleRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: IOrganizationRepository,
    private readonly accessControlService: AccessControlService,
  ) {}

  async listPlatformRoles(scope?: RoleScope): Promise<RoleView[]> {
    const roles = await this.roleRepository.listPlatform(scope);
    return this.toViews(roles);
  }

  /** The platform templates plus the org's own custom roles. */
  async listOrganizationRoles(organizationId: string): Promise<RoleView[]> {
    await this.assertOrganizationExists(organizationId);
    const roles =
      await this.roleRepository.listVisibleToOrganization(organizationId);
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

    const keysByRole = await this.roleRepository.loadPermissionKeys(roleIds);

    for (const [roleId, keys] of keysByRole) {
      byRole.set(roleId, keys.filter(isPermission));
    }

    return byRole;
  }

  async assertOrganizationExists(organizationId: string): Promise<void> {
    const exists = await this.organizationRepository.exists(organizationId);

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
      const role = await this.roleRepository.create(
        {
          key: dto.key,
          name: dto.name,
          description: dto.description ?? null,
          scope,
          organizationId,
          isSystem: false,
        },
        dto.permissions,
      );

      return this.toView(role);
    } catch (error) {
      if (error instanceof DuplicateKeyError) {
        throw new ConflictException(`Role key "${dto.key}" is already taken.`);
      }
      throw error;
    }
  }

  private async updateRole(
    callerId: string,
    organizationId: string | null,
    role: Role,
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

    const updated = await this.roleRepository.update(
      role.id,
      { name: dto.name, description: dto.description },
      dto.permissions,
    );

    return this.toView(updated);
  }

  private async deleteRole(
    callerId: string,
    organizationId: string | null,
    role: Role,
  ): Promise<void> {
    this.assertNotSystem(role);

    const current = (await this.loadPermissionKeys([role.id])).get(role.id)!;
    await this.accessControlService.assertHoldsAll(
      callerId,
      organizationId,
      current,
    );

    const assignments = await this.roleRepository.countAssignments(role.id);

    if (assignments) {
      throw new ConflictException(
        `Role is still assigned ${assignments} time(s); unassign it first.`,
      );
    }

    await this.roleRepository.delete(role.id);
  }

  private async findPlatformRole(roleId: string): Promise<Role> {
    const role = await this.roleRepository.findPlatform(roleId);

    if (!role) {
      throw new NotFoundException('Role not found.');
    }

    return role;
  }

  /** A platform template or one of the org's own roles, never another org's. */
  private async findRoleVisibleToOrganization(
    organizationId: string,
    roleId: string,
  ): Promise<Role> {
    const role = await this.roleRepository.findVisibleToOrganization(
      organizationId,
      roleId,
    );

    if (!role) {
      throw new NotFoundException('Role not found.');
    }

    return role;
  }

  private async findCustomOrganizationRole(
    organizationId: string,
    roleId: string,
  ): Promise<Role> {
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

  private assertNotSystem(role: Role): void {
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

  private async toView(role: Role): Promise<RoleView> {
    return (await this.toViews([role]))[0];
  }

  private async toViews(roles: Role[]): Promise<RoleView[]> {
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
