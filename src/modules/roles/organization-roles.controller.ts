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
import { Permissions } from '../shared/constants/permissions';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { RequirePermissions } from '../shared/decorators/require-permissions.decorator';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

/**
 * Roles as seen from one organization: the platform templates (read-only
 * here) plus the org's own custom roles. Permissions are checked in
 * `:organizationId`.
 */
@Controller('organizations/:organizationId/roles')
export class OrganizationRolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermissions(Permissions.ROLES_READ)
  list(@Param('organizationId', ParseUUIDPipe) organizationId: string) {
    return this.rolesService.listOrganizationRoles(organizationId);
  }

  @Post()
  @RequirePermissions(Permissions.ROLES_MANAGE)
  create(
    @CurrentUser('id') callerId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() payload: CreateRoleDto,
  ) {
    return this.rolesService.createOrganizationRole(
      callerId,
      organizationId,
      payload,
    );
  }

  @Get(':roleId')
  @RequirePermissions(Permissions.ROLES_READ)
  get(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ) {
    return this.rolesService.getOrganizationRole(organizationId, roleId);
  }

  @Patch(':roleId')
  @RequirePermissions(Permissions.ROLES_MANAGE)
  update(
    @CurrentUser('id') callerId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() payload: UpdateRoleDto,
  ) {
    return this.rolesService.updateOrganizationRole(
      callerId,
      organizationId,
      roleId,
      payload,
    );
  }

  @Delete(':roleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permissions.ROLES_MANAGE)
  remove(
    @CurrentUser('id') callerId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ) {
    return this.rolesService.deleteOrganizationRole(
      callerId,
      organizationId,
      roleId,
    );
  }
}
