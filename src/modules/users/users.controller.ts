import { Controller, Get, Query } from '@nestjs/common';
import { Permissions } from '../shared/constants/permissions';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { RequirePermissions } from '../shared/decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../shared/interfaces/authenticated-user.interface';
import { MyPermissionsQueryDto } from './dto/my-permissions-query.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getCurrentUser(user);
  }

  @Get('me/permissions')
  getMyPermissions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MyPermissionsQueryDto,
  ) {
    return this.usersService.getMyPermissions(user, query.organizationId);
  }

  @Get()
  @RequirePermissions(Permissions.USERS_READ)
  listUsers() {
    return this.usersService.listForAdministration();
  }
}
