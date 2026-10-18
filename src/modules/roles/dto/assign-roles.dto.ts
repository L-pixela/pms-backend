import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

/** The complete set of roles the user should hold; an empty list removes all. */
export class AssignRolesDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  roleIds: string[];
}
