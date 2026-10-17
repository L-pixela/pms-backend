import { RefreshTokenSessionEntity } from '../auth/entities/refresh-token-session.entity';
import { OrganizationMembershipRoleEntity } from '../modules/organizations/entities/organization-membership-role.entity';
import { OrganizationMembershipEntity } from '../modules/organizations/entities/organization-membership.entity';
import { OrganizationEntity } from '../modules/organizations/entities/organization.entity';
import { PermissionEntity } from '../modules/shared/entities/permission.entity';
import { RolePermissionEntity } from '../modules/shared/entities/role-permission.entity';
import { RoleEntity } from '../modules/shared/entities/role.entity';
import { UserGlobalRoleEntity } from '../modules/users/entities/user-global-role.entity';
import { UserEntity } from '../modules/users/entities/user.entity';

export const ALL_ENTITIES = [
  UserEntity,
  UserGlobalRoleEntity,
  OrganizationEntity,
  OrganizationMembershipEntity,
  OrganizationMembershipRoleEntity,
  RoleEntity,
  PermissionEntity,
  RolePermissionEntity,
  RefreshTokenSessionEntity,
];
