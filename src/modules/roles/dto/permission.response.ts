import { ApiProperty } from '@nestjs/swagger';
import { ALL_PERMISSIONS } from '../../shared/constants/permissions';
import { RoleScope } from '../../shared/domain/role';

export class PermissionResponseDto {
  @ApiProperty({ enum: ALL_PERMISSIONS, example: 'roles.manage' })
  key: string;

  description: string;

  /** Role scopes allowed to hold the permission. */
  @ApiProperty({ enum: RoleScope, isArray: true })
  scopes: RoleScope[];
}
