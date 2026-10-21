import type { Role } from '../../shared/domain/role';

/** A user as seen from one organization: the membership with its roles. */
export interface OrganizationMember {
  userId: string;
  email: string;
  isActive: boolean;
  joinedAt: Date;
  /** Sorted by key. */
  roles: Role[];
}
