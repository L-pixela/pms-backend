import { ApiProperty } from '@nestjs/swagger';
import {
  ALL_PERMISSIONS,
  type Permission,
} from '../../shared/constants/permissions';

export class MyPermissionsResponseDto {
  /** `null` for platform-wide permissions. */
  organizationId: string | null;

  @ApiProperty({ enum: ALL_PERMISSIONS, isArray: true })
  permissions: Permission[];
}
