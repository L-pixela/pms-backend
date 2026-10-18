import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { isPermission, Permission } from '../constants/permissions';
import {
  PERMISSION_REPOSITORY,
  type IPermissionRepository,
} from '../repositories/permission.repository.interface';

/**
 * Resolves what a user may do, straight from the database, so role edits,
 * revocations and deactivations apply to the very next request.
 */
@Injectable()
export class AccessControlService {
  constructor(
    @Inject(PERMISSION_REPOSITORY)
    private readonly permissionRepository: IPermissionRepository,
  ) {}

  /**
   * Permissions of the user's global roles, plus, when `organizationId` is
   * given, those of the roles their membership in that org holds. Global
   * permissions apply in every org; org permissions never leak to another org.
   * An inactive user has none.
   */
  async getEffectivePermissions(
    userId: string,
    organizationId: string | null,
  ): Promise<Set<Permission>> {
    const keys = await this.permissionRepository.findEffectivePermissionKeys(
      userId,
      organizationId,
    );

    // A key that is in the DB but no longer in code grants nothing.
    return new Set(keys.filter(isPermission));
  }

  /**
   * Blocks privilege escalation: a caller can only create, change, delete,
   * assign or unassign a role whose permissions they all hold themselves.
   */
  async assertHoldsAll(
    userId: string,
    organizationId: string | null,
    permissions: Iterable<Permission>,
  ): Promise<void> {
    const granted = await this.getEffectivePermissions(userId, organizationId);
    const missing = [...new Set(permissions)].filter((p) => !granted.has(p));

    if (missing.length) {
      throw new ForbiddenException(
        `You cannot grant or revoke permissions you do not hold: ${missing.sort().join(', ')}.`,
      );
    }
  }
}
