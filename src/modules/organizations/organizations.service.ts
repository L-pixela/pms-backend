import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DuplicateKeyError } from '../../database/errors';
import type { PageRequest } from '../../database/repository.interface';
import { Permissions } from '../shared/constants/permissions';
import { AccessControlService } from '../shared/services/access-control.service';
import type { Organization } from './domain/organization';
import type { CreateOrganizationDto } from './dto/create-organization.dto';
import type { ListOrganizationsQueryDto } from './dto/list-organizations-query.dto';
import type { UpdateOrganizationDto } from './dto/update-organization.dto';
import {
  ORGANIZATION_REPOSITORY,
  type IOrganizationRepository,
} from './repositories/organization.repository.interface';

export interface OrganizationPage extends PageRequest {
  items: Organization[];
  total: number;
}

/** Organization CRUD with soft delete. Deleted organizations answer 404. */
@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: IOrganizationRepository,
    private readonly accessControlService: AccessControlService,
  ) {}

  async create(dto: CreateOrganizationDto): Promise<Organization> {
    try {
      return await this.organizationRepository.create({
        slug: dto.slug,
        name: dto.name,
      });
    } catch (error) {
      throw this.mapDuplicate(error, dto.slug);
    }
  }

  /**
   * Everything for callers holding the global `organizations.read`; otherwise
   * only the organizations the caller is a member of.
   */
  async list(
    callerId: string,
    query: ListOrganizationsQueryDto,
  ): Promise<OrganizationPage> {
    const globalPermissions =
      await this.accessControlService.getEffectivePermissions(callerId, null);
    const canReadAll = globalPermissions.has(Permissions.ORGANIZATIONS_READ);
    const includeDeleted = query.includeDeleted ?? false;

    if (includeDeleted && !canReadAll) {
      throw new ForbiddenException(
        'Listing deleted organizations needs the global organizations.read permission.',
      );
    }

    const page = { limit: query.limit, offset: query.offset };
    const result = canReadAll
      ? await this.organizationRepository.listAll(page, { includeDeleted })
      : await this.organizationRepository.listForUser(callerId, page);

    return { ...result, ...page };
  }

  async get(organizationId: string): Promise<Organization> {
    const organization =
      await this.organizationRepository.findById(organizationId);

    if (!organization) {
      throw new NotFoundException('Organization not found.');
    }

    return organization;
  }

  async update(
    organizationId: string,
    dto: UpdateOrganizationDto,
  ): Promise<Organization> {
    let updated: Organization | null;

    try {
      updated = await this.organizationRepository.update(organizationId, {
        name: dto.name,
        slug: dto.slug,
      });
    } catch (error) {
      throw this.mapDuplicate(error, dto.slug);
    }

    if (!updated) {
      throw new NotFoundException('Organization not found.');
    }

    return updated;
  }

  /** Memberships and roles are kept, so a restore brings everything back. */
  async softDelete(organizationId: string): Promise<void> {
    if (!(await this.organizationRepository.softDelete(organizationId))) {
      throw new NotFoundException('Organization not found.');
    }
  }

  async restore(organizationId: string): Promise<Organization> {
    let restored: Organization | null;

    try {
      restored = await this.organizationRepository.restore(organizationId);
    } catch (error) {
      if (error instanceof DuplicateKeyError) {
        throw new ConflictException(
          'Another organization now uses this slug; rename or delete it before restoring.',
        );
      }
      throw error;
    }

    if (!restored) {
      throw new NotFoundException('Deleted organization not found.');
    }

    return restored;
  }

  private mapDuplicate(error: unknown, slug: string | undefined): unknown {
    if (error instanceof DuplicateKeyError) {
      return new ConflictException(`Slug "${slug}" is already taken.`);
    }
    return error;
  }
}
