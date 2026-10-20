import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { ApiNotFoundResponse, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../shared/constants/permissions';
import { ApiUuidParam } from '../shared/decorators/api-uuid-param.decorator';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { RequirePermissions } from '../shared/decorators/require-permissions.decorator';
import { ErrorResponseDto } from '../shared/dto/error-response.dto';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { RoleSummaryResponseDto } from './dto/role-summary.response';
import { RoleAssignmentsService } from './role-assignments.service';

/** A user's global (platform-wide) roles. */
@ApiTags('Role assignments')
@ApiUuidParam('userId')
@Controller('users/:userId/roles')
export class UserRolesController {
  constructor(
    private readonly roleAssignmentsService: RoleAssignmentsService,
  ) {}

  /** List the user's global roles. */
  @Get()
  @RequirePermissions(Permissions.ROLES_READ)
  @ApiNotFoundResponse({
    description: 'User not found.',
    type: ErrorResponseDto,
  })
  list(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<RoleSummaryResponseDto[]> {
    return this.roleAssignmentsService.getUserGlobalRoles(userId);
  }

  /** Replace the user's global roles with the given set. */
  @Put()
  @RequirePermissions(Permissions.ROLES_MANAGE)
  @ApiNotFoundResponse({
    description: 'User not found.',
    type: ErrorResponseDto,
  })
  replace(
    @CurrentUser('id') callerId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() payload: AssignRolesDto,
  ): Promise<RoleSummaryResponseDto[]> {
    return this.roleAssignmentsService.replaceUserGlobalRoles(
      callerId,
      userId,
      payload.roleIds,
    );
  }
}

/** A member's roles inside one organization. */
@ApiTags('Role assignments')
@ApiUuidParam('organizationId')
@ApiUuidParam('userId')
@Controller('organizations/:organizationId/members/:userId/roles')
export class MemberRolesController {
  constructor(
    private readonly roleAssignmentsService: RoleAssignmentsService,
  ) {}

  /** List the member's roles in the organization. */
  @Get()
  @RequirePermissions(Permissions.ROLES_READ)
  @ApiNotFoundResponse({
    description: 'Organization not found or user is not a member.',
    type: ErrorResponseDto,
  })
  list(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<RoleSummaryResponseDto[]> {
    return this.roleAssignmentsService.getMemberRoles(organizationId, userId);
  }

  /** Replace the member's roles with the given set. */
  @Put()
  @RequirePermissions(Permissions.ROLES_MANAGE)
  @ApiNotFoundResponse({
    description: 'Organization not found or user is not a member.',
    type: ErrorResponseDto,
  })
  replace(
    @CurrentUser('id') callerId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() payload: AssignRolesDto,
  ): Promise<RoleSummaryResponseDto[]> {
    return this.roleAssignmentsService.replaceMemberRoles(
      callerId,
      organizationId,
      userId,
      payload.roleIds,
    );
  }
}
