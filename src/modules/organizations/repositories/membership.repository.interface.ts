import type {
  IRepository,
  PageRequest,
  Paginated,
} from '../../../database/repository.interface';
import type { OrganizationMember } from '../domain/organization-member';
import type { OrganizationMembership } from '../domain/organization-membership';

export interface IMembershipRepository extends IRepository<OrganizationMembership> {
  findByOrganizationAndUser(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMembership | null>;

  /**
   * Creates the membership and its role rows in one transaction.
   * @throws DuplicateKeyError when the user is already a member.
   * @throws MissingReferenceError when a role or the user was deleted meanwhile.
   */
  createWithRoles(
    organizationId: string,
    userId: string,
    roleIds: string[],
  ): Promise<OrganizationMembership>;

  findMember(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMember | null>;

  /** Oldest membership first; roles sorted by key. */
  listMembers(
    organizationId: string,
    page: PageRequest,
  ): Promise<Paginated<OrganizationMember>>;
}

export const MEMBERSHIP_REPOSITORY = Symbol('MEMBERSHIP_REPOSITORY');
