import { IsEnum, IsOptional } from 'class-validator';
import { RoleScope } from '../../shared/domain/role';

export class ListRolesQueryDto {
  @IsOptional()
  @IsEnum(RoleScope)
  scope?: RoleScope;
}
