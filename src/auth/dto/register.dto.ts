import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  // bcrypt only uses the first 72 bytes of the input.
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
