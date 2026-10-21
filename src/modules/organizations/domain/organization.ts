export interface Organization {
  id: string;
  slug: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  /** Set when the organization is soft-deleted. */
  deletedAt: Date | null;
}
