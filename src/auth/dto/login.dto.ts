import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { GlobalRole } from '../../modules/shared/enums/global-role.enum';
import { OrganizationRole } from '../../modules/shared/enums/organization-role.enum';

class OrganizationRoleMappingDto {
  @IsString()
  organizationId: string;

  @IsArray()
  @ArrayUnique()
  @IsEnum(OrganizationRole, { each: true })
  roles: OrganizationRole[];
}

export class LoginDto {
  @IsString()
  @MinLength(3)
  userId: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(GlobalRole, { each: true })
  globalRoles?: GlobalRole[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrganizationRoleMappingDto)
  organizationRoles?: OrganizationRoleMappingDto[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissions?: string[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
