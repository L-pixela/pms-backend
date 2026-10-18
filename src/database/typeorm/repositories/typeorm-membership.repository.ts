import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { OrganizationMembership } from '../../../modules/organizations/domain/organization-membership';
import type { IMembershipRepository } from '../../../modules/organizations/repositories/membership.repository.interface';
import { OrganizationMembershipEntity } from '../entities/organization-membership.entity';
import { toMembership } from '../mappers';
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
    @InjectRepository(OrganizationMembershipEntity)
    repository: Repository<OrganizationMembershipEntity>,
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
}
