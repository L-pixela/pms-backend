import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '../shared/decorators/public.decorator';
import { ErrorResponseDto } from '../shared/dto/error-response.dto';
import { AuthService } from './auth.service';
import { AuthTokensResponseDto } from './dto/auth-tokens.response';
import { LoginDto } from './dto/login.dto';
import { LogoutResponseDto } from './dto/logout.response';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { RegisteredUserResponseDto } from './dto/registered-user.response';

@ApiTags('Auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Create an account. Returns no tokens; log in afterwards. */
  @Post('register')
  @ApiConflictResponse({
    description: 'Email is already registered.',
    type: ErrorResponseDto,
  })
  register(@Body() payload: RegisterDto): Promise<RegisteredUserResponseDto> {
    return this.authService.register(payload);
  }

  /** Exchange credentials for an access and a refresh token. */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials or inactive user.',
    type: ErrorResponseDto,
  })
  login(@Body() payload: LoginDto): Promise<AuthTokensResponseDto> {
    return this.authService.login(payload);
  }

  /** Rotate the session: the refresh token is single-use. */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiUnauthorizedResponse({
    description:
      'Refresh token is invalid, expired or already used, or the user is inactive.',
    type: ErrorResponseDto,
  })
  refresh(@Body() payload: RefreshTokenDto): Promise<AuthTokensResponseDto> {
    return this.authService.refresh(payload);
  }

  /** Revoke the refresh token's session. */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiUnauthorizedResponse({
    description: 'Refresh token is invalid or expired.',
    type: ErrorResponseDto,
  })
  logout(@Body() payload: RefreshTokenDto): Promise<LogoutResponseDto> {
    return this.authService.logout(payload);
  }
}
