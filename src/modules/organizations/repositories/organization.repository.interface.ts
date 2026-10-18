import type { IRepository } from '../../../database/repository.interface';
import type { Organization } from '../domain/organization';

export type IOrganizationRepository = IRepository<Organization>;

export const ORGANIZATION_REPOSITORY = Symbol('ORGANIZATION_REPOSITORY');
