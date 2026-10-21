export class OrganizationResponseDto {
  id: string;
  slug: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;

  /** Set when the organization is soft-deleted. */
  deletedAt: Date | null;
}

export class OrganizationListResponseDto {
  items: OrganizationResponseDto[];

  /** Size of the whole list, not just this page. */
  total: number;
  limit: number;
  offset: number;
}
