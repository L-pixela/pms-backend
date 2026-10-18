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
  Query,
} from '@nestjs/common';
import {
  PERMISSION_CATALOG,
  Permissions,
} from '../shared/constants/permissions';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { RequirePermissions } from '../shared/decorators/require-permissions.decorator';
import { CreatePlatformRoleDto } from './dto/create-role.dto';
import { ListRolesQueryDto } from './dto/list-roles-query.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

/** The permission catalog. Any signed-in user may read it. */
@Controller('permissions')
export class PermissionsController {
  @Get()
  list() {
    return Object.entries(PERMISSION_CATALOG).map(([key, definition]) => ({
      key,
      ...definition,
    }));
  }
}

/** Platform roles: global roles and the org templates every org can use. */
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermissions(Permissions.ROLES_READ)
  list(@Query() query: ListRolesQueryDto) {
    return this.rolesService.listPlatformRoles(query.scope);
  }

  @Post()
  @RequirePermissions(Permissions.ROLES_MANAGE)
  create(
    @CurrentUser('id') callerId: string,
    @Body() payload: CreatePlatformRoleDto,
  ) {
    return this.rolesService.createPlatformRole(callerId, payload);
  }

  @Get(':roleId')
  @RequirePermissions(Permissions.ROLES_READ)
  get(@Param('roleId', ParseUUIDPipe) roleId: string) {
    return this.rolesService.getPlatformRole(roleId);
  }

  @Patch(':roleId')
  @RequirePermissions(Permissions.ROLES_MANAGE)
  update(
    @CurrentUser('id') callerId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() payload: UpdateRoleDto,
  ) {
    return this.rolesService.updatePlatformRole(callerId, roleId, payload);
  }

  @Delete(':roleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permissions.ROLES_MANAGE)
  remove(
    @CurrentUser('id') callerId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ) {
    return this.rolesService.deletePlatformRole(callerId, roleId);
  }
}
