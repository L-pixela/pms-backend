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
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  PERMISSION_CATALOG,
  Permissions,
} from '../shared/constants/permissions';
import { ApiUuidParam } from '../shared/decorators/api-uuid-param.decorator';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { RequirePermissions } from '../shared/decorators/require-permissions.decorator';
import { ErrorResponseDto } from '../shared/dto/error-response.dto';
import { CreatePlatformRoleDto } from './dto/create-role.dto';
import { ListRolesQueryDto } from './dto/list-roles-query.dto';
import { PermissionResponseDto } from './dto/permission.response';
import { RoleResponseDto } from './dto/role.response';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

/** The permission catalog. Any signed-in user may read it. */
@ApiTags('Permissions')
@Controller('permissions')
export class PermissionsController {
  /** The permissions the code enforces, with the role scopes that may hold each. */
  @Get()
  list(): PermissionResponseDto[] {
    return Object.entries(PERMISSION_CATALOG).map(([key, definition]) => ({
      key,
      description: definition.description,
      scopes: [...definition.scopes],
    }));
  }
}

/** Platform roles: global roles and the org templates every org can use. */
@ApiTags('Roles')
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  /** List platform roles, optionally by scope. */
  @Get()
  @RequirePermissions(Permissions.ROLES_READ)
  list(@Query() query: ListRolesQueryDto): Promise<RoleResponseDto[]> {
    return this.rolesService.listPlatformRoles(query.scope);
  }

  /** Create a platform role. */
  @Post()
  @RequirePermissions(Permissions.ROLES_MANAGE)
  @ApiConflictResponse({
    description: 'Role key is already taken.',
    type: ErrorResponseDto,
  })
  create(
    @CurrentUser('id') callerId: string,
    @Body() payload: CreatePlatformRoleDto,
  ): Promise<RoleResponseDto> {
    return this.rolesService.createPlatformRole(callerId, payload);
  }

  /** Get one platform role. */
  @Get(':roleId')
  @RequirePermissions(Permissions.ROLES_READ)
  @ApiUuidParam('roleId')
  @ApiNotFoundResponse({
    description: 'Role not found.',
    type: ErrorResponseDto,
  })
  get(
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ): Promise<RoleResponseDto> {
    return this.rolesService.getPlatformRole(roleId);
  }

  /** Update a platform role. System roles are read-only. */
  @Patch(':roleId')
  @RequirePermissions(Permissions.ROLES_MANAGE)
  @ApiUuidParam('roleId')
  @ApiNotFoundResponse({
    description: 'Role not found.',
    type: ErrorResponseDto,
  })
  update(
    @CurrentUser('id') callerId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() payload: UpdateRoleDto,
  ): Promise<RoleResponseDto> {
    return this.rolesService.updatePlatformRole(callerId, roleId, payload);
  }

  /** Delete a platform role. System roles and assigned roles cannot be deleted. */
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
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ): Promise<void> {
    return this.rolesService.deletePlatformRole(callerId, roleId);
  }
}
