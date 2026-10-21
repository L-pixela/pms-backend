import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  ALL_PERMISSIONS,
  type Permission,
} from '../../shared/constants/permissions';
import { RoleScope } from '../../shared/domain/role';

export const ROLE_KEY_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;

/** A custom role inside one organization (always organization-scoped). */
export class CreateRoleDto {
  @ApiProperty({
    pattern: ROLE_KEY_PATTERN.source,
    example: 'maintenance_lead',
  })
  @Matches(ROLE_KEY_PATTERN, {
    message:
      'key must be 2-64 characters of lowercase letters, digits or underscores, starting with a letter',
  })
  key: string;

  @IsString()
  @Length(1, 120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(ALL_PERMISSIONS.length)
  @IsIn(ALL_PERMISSIONS, { each: true })
  permissions: Permission[];
}

/** A platform role: global, or an organization template every org can use. */
export class CreatePlatformRoleDto extends CreateRoleDto {
  @IsEnum(RoleScope)
  scope: RoleScope;
}
