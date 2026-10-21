import {
  MembershipRolesResponseDto,
  RoleSummaryResponseDto,
} from '../../roles/dto/role-summary.response';

export class CurrentUserResponseDto {
  id: string;
  email: string;
  globalRoles: RoleSummaryResponseDto[];

  /** The caller's roles in each organization they belong to. */
  organizations: MembershipRolesResponseDto[];
}
