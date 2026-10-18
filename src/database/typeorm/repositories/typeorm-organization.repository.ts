import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Organization } from '../../../modules/organizations/domain/organization';
import type { IOrganizationRepository } from '../../../modules/organizations/repositories/organization.repository.interface';
import { OrganizationEntity } from '../entities/organization.entity';
import { toOrganization } from '../mappers';
import { BaseTypeOrmRepository } from './base-typeorm.repository';

@Injectable()
export class TypeOrmOrganizationRepository
  extends BaseTypeOrmRepository<OrganizationEntity, Organization>
  implements IOrganizationRepository
{
  constructor(
    @InjectRepository(OrganizationEntity)
    repository: Repository<OrganizationEntity>,
  ) {
    super(repository);
  }

  protected toDomain(entity: OrganizationEntity): Organization {
    return toOrganization(entity);
  }
}
