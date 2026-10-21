import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import type { OrganizationMember } from '../../../modules/organizations/domain/organization-member';
import type { OrganizationMembership } from '../../../modules/organizations/domain/organization-membership';
import type { IMembershipRepository } from '../../../modules/organizations/repositories/membership.repository.interface';
import { DuplicateKeyError, MissingReferenceError } from '../../errors';
import type { PageRequest, Paginated } from '../../repository.interface';
import { OrganizationMembershipRoleEntity } from '../entities/organization-membership-role.entity';
import { OrganizationMembershipEntity } from '../entities/organization-membership.entity';
import { toMembership, toRole } from '../mappers';
import { isForeignKeyViolation, isUniqueViolation } from '../postgres-errors';
import { BaseTypeOrmRepository } from './base-typeorm.repository';

@Injectable()
export class TypeOrmMembershipRepository
  extends BaseTypeOrmRepository<
    OrganizationMembershipEntity,
    OrganizationMembership
  >
  implements IMembershipRepository
{
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(OrganizationMembershipEntity)
    repository: Repository<OrganizationMembershipEntity>,
    @InjectRepository(OrganizationMembershipRoleEntity)
    private readonly membershipRoleRepository: Repository<OrganizationMembershipRoleEntity>,
  ) {
    super(repository);
  }

  protected toDomain(
    entity: OrganizationMembershipEntity,
  ): OrganizationMembership {
    return toMembership(entity);
  }

  async findByOrganizationAndUser(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMembership | null> {
    const entity = await this.repository.findOne({
      where: { organizationId, userId },
    });
    return entity ? toMembership(entity) : null;
  }

  async createWithRoles(
    organizationId: string,
    userId: string,
    roleIds: string[],
  ): Promise<OrganizationMembership> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const membership = await manager.save(
          OrganizationMembershipEntity,
          manager.create(OrganizationMembershipEntity, {
            organizationId,
            userId,
          }),
        );
        if (roleIds.length) {
          await manager.insert(
            OrganizationMembershipRoleEntity,
            roleIds.map((roleId) => ({ membershipId: membership.id, roleId })),
          );
        }
        return toMembership(membership);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateKeyError('User is already a member.');
      }
      if (isForeignKeyViolation(error)) {
        throw new MissingReferenceError('A role or the user no longer exists.');
      }
      throw error;
    }
  }

  async findMember(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMember | null> {
    const entity = await this.repository.findOne({
      where: { organizationId, userId },
      relations: { user: true },
    });
    if (!entity) {
      return null;
    }
    return (await this.toMembers([entity]))[0];
  }

  async listMembers(
    organizationId: string,
    page: PageRequest,
  ): Promise<Paginated<OrganizationMember>> {
    const [entities, total] = await this.repository.findAndCount({
      where: { organizationId },
      relations: { user: true },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: page.limit,
      skip: page.offset,
    });
    return { items: await this.toMembers(entities), total };
  }

  /** Loads the roles of every membership in one query. */
  private async toMembers(
    memberships: OrganizationMembershipEntity[],
  ): Promise<OrganizationMember[]> {
    const rows = memberships.length
      ? await this.membershipRoleRepository.find({
          where: { membershipId: In(memberships.map(({ id }) => id)) },
          relations: { role: true },
          order: { role: { key: 'ASC' } },
        })
      : [];

    const rolesByMembership = new Map<string, OrganizationMember['roles']>();
    for (const row of rows) {
      const roles = rolesByMembership.get(row.membershipId) ?? [];
      roles.push(toRole(row.role));
      rolesByMembership.set(row.membershipId, roles);
    }

    return memberships.map((membership) => ({
      userId: membership.userId,
      email: membership.user.email,
      isActive: membership.user.isActive,
      joinedAt: membership.createdAt,
      roles: rolesByMembership.get(membership.id) ?? [],
    }));
  }
}
