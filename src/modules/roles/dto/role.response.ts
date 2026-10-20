import { ApiProperty } from '@nestjs/swagger';
import {
  ALL_PERMISSIONS,
  type Permission,
} from '../../shared/constants/permissions';
import { RoleScope } from '../../shared/domain/role';

export class RoleResponseDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  scope: RoleScope;

  /** `null` for platform roles. */
  organizationId: string | null;

  /** System roles belong to the seed and are read-only. */
  isSystem: boolean;

  @ApiProperty({ enum: ALL_PERMISSIONS, isArray: true })
  permissions: Permission[];

  createdAt: Date;
  updatedAt: Date;
}
