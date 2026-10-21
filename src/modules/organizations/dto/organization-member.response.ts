import { RoleSummaryResponseDto } from '../../roles/dto/role-summary.response';

export class OrganizationMemberResponseDto {
  userId: string;
  email: string;
  isActive: boolean;
  joinedAt: Date;
  roles: RoleSummaryResponseDto[];
}

export class OrganizationMemberListResponseDto {
  items: OrganizationMemberResponseDto[];

  /** Size of the whole list, not just this page. */
  total: number;
  limit: number;
  offset: number;
}
