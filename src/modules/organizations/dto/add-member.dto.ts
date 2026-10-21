import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class AddMemberDto {
  /** Email of an existing user. */
  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  /** Roles the member starts with: platform templates or the organization's own roles. May be empty. */
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  roleIds: string[];
}
