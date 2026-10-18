import type { RefreshTokenSession } from '../../auth/domain/refresh-token-session';
import type { OrganizationMembership } from '../../modules/organizations/domain/organization-membership';
import type { Organization } from '../../modules/organizations/domain/organization';
import type { Role } from '../../modules/shared/domain/role';
import type { User } from '../../modules/users/domain/user';
import type { OrganizationMembershipEntity } from './entities/organization-membership.entity';
import type { OrganizationEntity } from './entities/organization.entity';
import type { RefreshTokenSessionEntity } from './entities/refresh-token-session.entity';
import type { RoleEntity } from './entities/role.entity';
import type { UserEntity } from './entities/user.entity';

export function toUser(entity: UserEntity): User {
  return {
    id: entity.id,
    email: entity.email,
    passwordHash: entity.passwordHash,
    isActive: entity.isActive,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

export function toRole(entity: RoleEntity): Role {
  return {
    id: entity.id,
    key: entity.key,
    name: entity.name,
    description: entity.description,
    scope: entity.scope,
    organizationId: entity.organizationId,
    isSystem: entity.isSystem,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

export function toOrganization(entity: OrganizationEntity): Organization {
  return {
    id: entity.id,
    slug: entity.slug,
    name: entity.name,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

export function toMembership(
  entity: OrganizationMembershipEntity,
): OrganizationMembership {
  return {
    id: entity.id,
    userId: entity.userId,
    organizationId: entity.organizationId,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

export function toSession(
  entity: RefreshTokenSessionEntity,
): RefreshTokenSession {
  return {
    id: entity.id,
    userId: entity.userId,
    sessionId: entity.sessionId,
    tokenHash: entity.tokenHash,
    expiresAt: entity.expiresAt,
    revokedAt: entity.revokedAt,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}
