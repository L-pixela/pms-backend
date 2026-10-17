import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationMembershipRoleEntity } from '../modules/organizations/entities/organization-membership-role.entity';
import { RolePermissionEntity } from '../modules/shared/entities/role-permission.entity';
import { RoleScope } from '../modules/shared/entities/role.entity';
import { GlobalRole } from '../modules/shared/enums/global-role.enum';
import { OrganizationRole } from '../modules/shared/enums/organization-role.enum';
import { UserGlobalRoleEntity } from '../modules/users/entities/user-global-role.entity';
import { UserEntity } from '../modules/users/entities/user.entity';

export interface UserClaims {
  id: string;
  email: string;
  isActive: boolean;
  globalRoles: GlobalRole[];
  organizationRoles: Record<string, OrganizationRole[]>;
  permissions: string[];
}

const GLOBAL_ROLES = new Set<string>(Object.values(GlobalRole));
const ORGANIZATION_ROLES = new Set<string>(Object.values(OrganizationRole));

/**
 * Loads a user's roles and permissions from the database so tokens never
 * carry privileges the caller asserted or that have since been revoked.
 */
@Injectable()
export class UserClaimsService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(UserGlobalRoleEntity)
    private readonly userGlobalRoleRepository: Repository<UserGlobalRoleEntity>,
    @InjectRepository(OrganizationMembershipRoleEntity)
    private readonly membershipRoleRepository: Repository<OrganizationMembershipRoleEntity>,
    @InjectRepository(RolePermissionEntity)
    private readonly rolePermissionRepository: Repository<RolePermissionEntity>,
  ) {}

  async loadClaims(userId: string): Promise<UserClaims | null> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      return null;
    }

    const globalRoleRows = await this.userGlobalRoleRepository
      .createQueryBuilder('userRole')
      .innerJoin('userRole.role', 'role')
      .select('role.id', 'roleId')
      .addSelect('role.key', 'key')
      .where('userRole.userId = :userId', { userId })
      .andWhere('role.scope = :scope', { scope: RoleScope.GLOBAL })
      .getRawMany<{ roleId: string; key: string }>();

    const organizationRoleRows = await this.membershipRoleRepository
      .createQueryBuilder('membershipRole')
      .innerJoin('membershipRole.membership', 'membership')
      .innerJoin('membershipRole.role', 'role')
      .select('membership.organizationId', 'organizationId')
      .addSelect('role.key', 'key')
      .where('membership.userId = :userId', { userId })
      .andWhere('role.scope = :scope', { scope: RoleScope.ORGANIZATION })
      .getRawMany<{ organizationId: string; key: string }>();

    // Only global roles contribute to the flat permission list. Org-role
    // permissions must stay scoped to their org (see IMPLEMENTATION_PLAN.md,
    // Phase 3), otherwise a tenant in one org would gain them everywhere.
    const globalRoleIds = globalRoleRows.map((row) => row.roleId);
    const permissionRows = globalRoleIds.length
      ? await this.rolePermissionRepository
          .createQueryBuilder('rolePermission')
          .innerJoin('rolePermission.permission', 'permission')
          .select('DISTINCT permission.key', 'key')
          .where('rolePermission.roleId IN (:...roleIds)', {
            roleIds: globalRoleIds,
          })
          .getRawMany<{ key: string }>()
      : [];

    const organizationRoles: Record<string, OrganizationRole[]> = {};
    for (const { organizationId, key } of organizationRoleRows) {
      if (!ORGANIZATION_ROLES.has(key)) {
        continue;
      }
      (organizationRoles[organizationId] ??= []).push(key as OrganizationRole);
    }

    return {
      id: user.id,
      email: user.email,
      isActive: user.isActive,
      globalRoles: globalRoleRows
        .map((row) => row.key)
        .filter((key): key is GlobalRole => GLOBAL_ROLES.has(key)),
      organizationRoles,
      permissions: permissionRows.map((row) => row.key).sort(),
    };
  }
}
