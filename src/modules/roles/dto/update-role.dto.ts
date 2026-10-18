import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import {
  ALL_PERMISSIONS,
  type Permission,
} from '../../shared/constants/permissions';

/** `key` and `scope` are fixed once a role exists. */
export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  /** Replaces the role's whole permission set. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(ALL_PERMISSIONS.length)
  @IsIn(ALL_PERMISSIONS, { each: true })
  permissions?: Permission[];
}
