import { Body, Controller, Post } from '@nestjs/common';
import { Public } from '../modules/shared/decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() payload: LoginDto) {
    return this.authService.login(payload);
  }

  @Post('refresh')
  refresh(@Body() payload: RefreshTokenDto) {
    return this.authService.refresh(payload);
  }

  @Post('logout')
  logout(@Body() payload: RefreshTokenDto) {
    return this.authService.logout(payload);
  }
}
