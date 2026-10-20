import { RoleScope } from '../../shared/domain/role';

export class RoleSummaryResponseDto {
  id: string;
  key: string;
  name: string;
  scope: RoleScope;

  /** `null` for platform roles. */
  organizationId: string | null;
}

export class MembershipRolesResponseDto {
  organizationId: string;
  roles: RoleSummaryResponseDto[];
}
