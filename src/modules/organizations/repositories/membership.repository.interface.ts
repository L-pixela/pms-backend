import type { IRepository } from '../../../database/repository.interface';
import type { OrganizationMembership } from '../domain/organization-membership';

export interface IMembershipRepository extends IRepository<OrganizationMembership> {
  findByOrganizationAndUser(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMembership | null>;
}

export const MEMBERSHIP_REPOSITORY = Symbol('MEMBERSHIP_REPOSITORY');
