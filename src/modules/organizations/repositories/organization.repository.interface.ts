import type {
  IRepository,
  PageRequest,
  Paginated,
} from '../../../database/repository.interface';
import type { Organization } from '../domain/organization';

export interface NewOrganization {
  slug: string;
  name: string;
}

export interface OrganizationPatch {
  slug?: string;
  name?: string;
}

/**
 * Organizations are soft-deleted: `findById`, `exists` and the lists skip
 * deleted ones unless stated otherwise, and there is no hard `delete`.
 */
export interface IOrganizationRepository extends Omit<
  IRepository<Organization>,
  'delete'
> {
  /** @throws DuplicateKeyError when a live organization has the slug. */
  create(organization: NewOrganization): Promise<Organization>;

  /**
   * Updates a live organization, always bumping `updatedAt`. Returns `null`
   * when it does not exist or is deleted.
   * @throws DuplicateKeyError when a live organization has the slug.
   */
  update(id: string, patch: OrganizationPatch): Promise<Organization | null>;

  /** Newest first. */
  listAll(
    page: PageRequest,
    options: { includeDeleted: boolean },
  ): Promise<Paginated<Organization>>;

  /** Live organizations the user is a member of, newest first. */
  listForUser(
    userId: string,
    page: PageRequest,
  ): Promise<Paginated<Organization>>;

  /** `false` when it does not exist or is already deleted. */
  softDelete(id: string): Promise<boolean>;

  /**
   * Returns `null` when it does not exist or is not deleted.
   * @throws DuplicateKeyError when a live organization now has its slug.
   */
  restore(id: string): Promise<Organization | null>;
}

export const ORGANIZATION_REPOSITORY = Symbol('ORGANIZATION_REPOSITORY');
