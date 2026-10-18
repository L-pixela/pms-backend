import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { isPermission, Permission } from '../constants/permissions';

/**
 * Resolves what a user may do, straight from the database, so role edits,
 * revocations and deactivations apply to the very next request.
 */
@Injectable()
export class AccessControlService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

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
    const rows = await this.dataSource.query<{ key: string }[]>(
      `SELECT p.key
         FROM users u
         JOIN user_global_roles ugr ON ugr.user_id = u.id
         JOIN roles r ON r.id = ugr.role_id AND r.scope = 'global'
         JOIN role_permissions rp ON rp.role_id = r.id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE u.id = $1 AND u.is_active
       UNION
       SELECT p.key
         FROM users u
         JOIN organization_memberships m
           ON m.user_id = u.id AND m.organization_id = $2
         JOIN organization_membership_roles mr ON mr.membership_id = m.id
         JOIN roles r
           ON r.id = mr.role_id
          AND r.scope = 'organization'
          AND (r.organization_id IS NULL OR r.organization_id = m.organization_id)
         JOIN role_permissions rp ON rp.role_id = r.id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE u.id = $1 AND u.is_active`,
      [userId, organizationId],
    );

    // A key that is in the DB but no longer in code grants nothing.
    return new Set(rows.map((row) => row.key).filter(isPermission));
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
