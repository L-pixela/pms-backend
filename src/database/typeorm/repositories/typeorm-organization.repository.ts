import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { Organization } from '../../../modules/organizations/domain/organization';
import type {
  IOrganizationRepository,
  NewOrganization,
  OrganizationPatch,
} from '../../../modules/organizations/repositories/organization.repository.interface';
import { DuplicateKeyError } from '../../errors';
import type { PageRequest, Paginated } from '../../repository.interface';
import { OrganizationMembershipEntity } from '../entities/organization-membership.entity';
import { OrganizationEntity } from '../entities/organization.entity';
import { toOrganization } from '../mappers';
import { isUniqueViolation } from '../postgres-errors';
import { BaseTypeOrmRepository } from './base-typeorm.repository';

const SLUG_TAKEN = 'Slug is already taken.';

/**
 * `findById`, `exists` and every query below skip soft-deleted rows (the
 * entity's `@DeleteDateColumn`). The inherited hard `delete` is not part of
 * the port, so nothing outside this class can reach it.
 */
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

  async create(organization: NewOrganization): Promise<Organization> {
    try {
      const saved = await this.repository.save(
        this.repository.create(organization),
      );
      return toOrganization(saved);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateKeyError(SLUG_TAKEN);
      }
      throw error;
    }
  }

  async update(
    id: string,
    patch: OrganizationPatch,
  ): Promise<Organization | null> {
    const values: OrganizationPatch = {};
    if (patch.name !== undefined) {
      values.name = patch.name;
    }
    if (patch.slug !== undefined) {
      values.slug = patch.slug;
    }

    // Nothing to change: do not touch the row (or `updatedAt`).
    if (!Object.keys(values).length) {
      return this.findById(id);
    }

    try {
      const result = await this.repository.update(
        { id, deletedAt: IsNull() },
        values,
      );
      if (!result.affected) {
        return null;
      }
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateKeyError(SLUG_TAKEN);
      }
      throw error;
    }

    return this.findById(id);
  }

  async listAll(
    page: PageRequest,
    options: { includeDeleted: boolean },
  ): Promise<Paginated<Organization>> {
    const [entities, total] = await this.repository.findAndCount({
      withDeleted: options.includeDeleted,
      order: { createdAt: 'DESC', id: 'ASC' },
      take: page.limit,
      skip: page.offset,
    });
    return { items: entities.map(toOrganization), total };
  }

  async listForUser(
    userId: string,
    page: PageRequest,
  ): Promise<Paginated<Organization>> {
    // The soft-delete filter applies to the `organization` alias.
    const [entities, total] = await this.repository
      .createQueryBuilder('organization')
      .innerJoin(
        OrganizationMembershipEntity,
        'membership',
        'membership.organizationId = organization.id',
      )
      .where('membership.userId = :userId', { userId })
      .orderBy('organization.createdAt', 'DESC')
      .addOrderBy('organization.id', 'ASC')
      .take(page.limit)
      .skip(page.offset)
      .getManyAndCount();
    return { items: entities.map(toOrganization), total };
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.repository
      .createQueryBuilder()
      .softDelete()
      .where('id = :id AND deleted_at IS NULL', { id })
      .execute();
    return !!result.affected;
  }

  async restore(id: string): Promise<Organization | null> {
    try {
      const result = await this.repository
        .createQueryBuilder()
        .restore()
        .where('id = :id AND deleted_at IS NOT NULL', { id })
        .execute();
      if (!result.affected) {
        return null;
      }
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateKeyError(SLUG_TAKEN);
      }
      throw error;
    }

    return this.findById(id);
  }
}
