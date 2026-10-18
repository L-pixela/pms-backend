import { RefreshTokenSessionEntity } from './typeorm/entities/refresh-token-session.entity';
import { OrganizationMembershipRoleEntity } from './typeorm/entities/organization-membership-role.entity';
import { OrganizationMembershipEntity } from './typeorm/entities/organization-membership.entity';
import { OrganizationEntity } from './typeorm/entities/organization.entity';
import { PermissionEntity } from './typeorm/entities/permission.entity';
import { RolePermissionEntity } from './typeorm/entities/role-permission.entity';
import { RoleEntity } from './typeorm/entities/role.entity';
import { UserGlobalRoleEntity } from './typeorm/entities/user-global-role.entity';
import { UserEntity } from './typeorm/entities/user.entity';

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
