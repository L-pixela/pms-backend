import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Permissions } from '../shared/constants/permissions';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { RequirePermissions } from '../shared/decorators/require-permissions.decorator';
import { RequireRoles } from '../shared/decorators/require-roles.decorator';
import { GlobalRole } from '../shared/enums/global-role.enum';
import type { AuthenticatedUser } from '../shared/interfaces/authenticated-user.interface';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getCurrentUser(user);
  }

  @Get()
  @RequireRoles({ global: [GlobalRole.PLATFORM_ADMIN] })
  @RequirePermissions(Permissions.USERS_READ)
  listUsers() {
    return this.usersService.listForAdministration();
  }
}
