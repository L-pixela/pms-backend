import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  // bcrypt only uses the first 72 bytes of the input.
  @ApiProperty({ example: 'correct-horse-battery' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
