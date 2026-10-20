import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Permissions } from '../shared/constants/permissions';
import { ApiUuidParam } from '../shared/decorators/api-uuid-param.decorator';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { RequirePermissions } from '../shared/decorators/require-permissions.decorator';
import { ErrorResponseDto } from '../shared/dto/error-response.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { RoleResponseDto } from './dto/role.response';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

/**
 * Roles as seen from one organization: the platform templates (read-only
 * here) plus the org's own custom roles. Permissions are checked in
 * `:organizationId`.
 */
@ApiTags('Organization roles')
@ApiUuidParam('organizationId')
@Controller('organizations/:organizationId/roles')
export class OrganizationRolesController {
  constructor(private readonly rolesService: RolesService) {}

  /** List the platform templates and the organization's custom roles. */
  @Get()
  @RequirePermissions(Permissions.ROLES_READ)
  @ApiNotFoundResponse({
    description: 'Organization not found.',
    type: ErrorResponseDto,
  })
  list(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ): Promise<RoleResponseDto[]> {
    return this.rolesService.listOrganizationRoles(organizationId);
  }

  /** Create a custom role in the organization. */
  @Post()
  @RequirePermissions(Permissions.ROLES_MANAGE)
  @ApiNotFoundResponse({
    description: 'Organization not found.',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'Role key is already taken.',
    type: ErrorResponseDto,
  })
  create(
    @CurrentUser('id') callerId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() payload: CreateRoleDto,
  ): Promise<RoleResponseDto> {
    return this.rolesService.createOrganizationRole(
      callerId,
      organizationId,
      payload,
    );
  }

  /** Get a platform template or a custom role of the organization. */
  @Get(':roleId')
  @RequirePermissions(Permissions.ROLES_READ)
  @ApiUuidParam('roleId')
  @ApiNotFoundResponse({
    description: 'Organization or role not found.',
    type: ErrorResponseDto,
  })
  get(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ): Promise<RoleResponseDto> {
    return this.rolesService.getOrganizationRole(organizationId, roleId);
  }

  /** Update a custom role. Platform templates are read-only here. */
  @Patch(':roleId')
  @RequirePermissions(Permissions.ROLES_MANAGE)
  @ApiUuidParam('roleId')
  @ApiNotFoundResponse({
    description: 'Role not found.',
    type: ErrorResponseDto,
  })
  update(
    @CurrentUser('id') callerId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() payload: UpdateRoleDto,
  ): Promise<RoleResponseDto> {
    return this.rolesService.updateOrganizationRole(
      callerId,
      organizationId,
      roleId,
      payload,
    );
  }

  /** Delete a custom role. Assigned roles cannot be deleted. */
  @Delete(':roleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permissions.ROLES_MANAGE)
  @ApiUuidParam('roleId')
  @ApiNoContentResponse({ description: 'Role deleted.' })
  @ApiNotFoundResponse({
    description: 'Role not found.',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'Role is still assigned.',
    type: ErrorResponseDto,
  })
  remove(
    @CurrentUser('id') callerId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ): Promise<void> {
    return this.rolesService.deleteOrganizationRole(
      callerId,
      organizationId,
      roleId,
    );
  }
}
