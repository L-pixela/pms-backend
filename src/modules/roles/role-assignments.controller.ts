import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { Permissions } from '../shared/constants/permissions';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { RequirePermissions } from '../shared/decorators/require-permissions.decorator';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { RoleAssignmentsService } from './role-assignments.service';

/** A user's global (platform-wide) roles. */
@Controller('users/:userId/roles')
export class UserRolesController {
  constructor(
    private readonly roleAssignmentsService: RoleAssignmentsService,
  ) {}

  @Get()
  @RequirePermissions(Permissions.ROLES_READ)
  list(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.roleAssignmentsService.getUserGlobalRoles(userId);
  }

  @Put()
  @RequirePermissions(Permissions.ROLES_MANAGE)
  replace(
    @CurrentUser('id') callerId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() payload: AssignRolesDto,
  ) {
    return this.roleAssignmentsService.replaceUserGlobalRoles(
      callerId,
      userId,
      payload.roleIds,
    );
  }
}

/** A member's roles inside one organization. */
@Controller('organizations/:organizationId/members/:userId/roles')
export class MemberRolesController {
  constructor(
    private readonly roleAssignmentsService: RoleAssignmentsService,
  ) {}

  @Get()
  @RequirePermissions(Permissions.ROLES_READ)
  list(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.roleAssignmentsService.getMemberRoles(organizationId, userId);
  }

  @Put()
  @RequirePermissions(Permissions.ROLES_MANAGE)
  replace(
    @CurrentUser('id') callerId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() payload: AssignRolesDto,
  ) {
    return this.roleAssignmentsService.replaceMemberRoles(
      callerId,
      organizationId,
      userId,
      payload.roleIds,
    );
  }
}
