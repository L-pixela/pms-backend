import { IsEnum, IsOptional } from 'class-validator';
import { RoleScope } from '../../shared/entities/role.entity';

export class ListRolesQueryDto {
  @IsOptional()
  @IsEnum(RoleScope)
  scope?: RoleScope;
}
