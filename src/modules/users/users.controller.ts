import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permissions } from '../shared/constants/permissions';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { RequirePermissions } from '../shared/decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../shared/interfaces/authenticated-user.interface';
import { CurrentUserResponseDto } from './dto/current-user.response';
import { MyPermissionsQueryDto } from './dto/my-permissions-query.dto';
import { MyPermissionsResponseDto } from './dto/my-permissions.response';
import { UserListResponseDto } from './dto/user-list.response';
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** The caller's identity, global roles and roles per organization. */
  @Get('me')
  getMe(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CurrentUserResponseDto> {
    return this.usersService.getCurrentUser(user);
  }

  /** The caller's effective permissions, platform-wide or in one organization. */
  @Get('me/permissions')
  getMyPermissions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MyPermissionsQueryDto,
  ): Promise<MyPermissionsResponseDto> {
    return this.usersService.getMyPermissions(user, query.organizationId);
  }

  /** List users. Not implemented yet: returns an empty stub. */
  @Get()
  @RequirePermissions(Permissions.USERS_READ)
  listUsers(): UserListResponseDto {
    return this.usersService.listForAdministration();
  }
}
