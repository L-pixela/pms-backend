import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { IPermissionRepository } from '../../../modules/shared/repositories/permission.repository.interface';

@Injectable()
export class TypeOrmPermissionRepository implements IPermissionRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findEffectivePermissionKeys(
    userId: string,
    organizationId: string | null,
  ): Promise<string[]> {
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
         JOIN organizations o
           ON o.id = m.organization_id AND o.deleted_at IS NULL
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

    return rows.map((row) => row.key);
  }
}
