export interface IPermissionRepository {
  /**
   * Permission keys of the user's global roles, plus, when `organizationId` is
   * given, those of the roles their membership in that org holds. An inactive
   * user has none.
   */
  findEffectivePermissionKeys(
    userId: string,
    organizationId: string | null,
  ): Promise<string[]>;
}

export const PERMISSION_REPOSITORY = Symbol('PERMISSION_REPOSITORY');
