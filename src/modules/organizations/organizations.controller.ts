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
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Permissions } from '../shared/constants/permissions';
import { ApiUuidParam } from '../shared/decorators/api-uuid-param.decorator';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { RequireGlobalPermissions } from '../shared/decorators/require-global-permissions.decorator';
import { RequirePermissions } from '../shared/decorators/require-permissions.decorator';
import { ErrorResponseDto } from '../shared/dto/error-response.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { ListOrganizationsQueryDto } from './dto/list-organizations-query.dto';
import {
  OrganizationListResponseDto,
  OrganizationResponseDto,
} from './dto/organization.response';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('Organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  /** Create an organization. Platform-level; the creator does not become a member. */
  @Post()
  @RequireGlobalPermissions(Permissions.ORGANIZATIONS_MANAGE)
  @ApiConflictResponse({
    description: 'Slug is already taken.',
    type: ErrorResponseDto,
  })
  create(
    @Body() payload: CreateOrganizationDto,
  ): Promise<OrganizationResponseDto> {
    return this.organizationsService.create(payload);
  }

  /** List organizations: all with the global organizations.read, otherwise the caller's own. */
  @Get()
  @ApiForbiddenResponse({
    description:
      'includeDeleted needs the global organizations.read permission.',
    type: ErrorResponseDto,
  })
  list(
    @CurrentUser('id') callerId: string,
    @Query() query: ListOrganizationsQueryDto,
  ): Promise<OrganizationListResponseDto> {
    return this.organizationsService.list(callerId, query);
  }

  /** Get an organization. */
  @Get(':organizationId')
  @RequirePermissions(Permissions.ORGANIZATIONS_READ)
  @ApiUuidParam('organizationId')
  @ApiNotFoundResponse({
    description: 'Organization not found or deleted.',
    type: ErrorResponseDto,
  })
  get(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ): Promise<OrganizationResponseDto> {
    return this.organizationsService.get(organizationId);
  }

  /** Update the organization's name or slug. */
  @Patch(':organizationId')
  @RequirePermissions(Permissions.ORGANIZATIONS_MANAGE)
  @ApiUuidParam('organizationId')
  @ApiNotFoundResponse({
    description: 'Organization not found or deleted.',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'Slug is already taken.',
    type: ErrorResponseDto,
  })
  update(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() payload: UpdateOrganizationDto,
  ): Promise<OrganizationResponseDto> {
    return this.organizationsService.update(organizationId, payload);
  }

  /** Soft-delete the organization. Platform-level; members and roles are kept for a restore. */
  @Delete(':organizationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireGlobalPermissions(Permissions.ORGANIZATIONS_MANAGE)
  @ApiUuidParam('organizationId')
  @ApiNoContentResponse({ description: 'Organization deleted.' })
  @ApiNotFoundResponse({
    description: 'Organization not found or already deleted.',
    type: ErrorResponseDto,
  })
  remove(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ): Promise<void> {
    return this.organizationsService.softDelete(organizationId);
  }

  /** Restore a soft-deleted organization with its members and roles. */
  @Post(':organizationId/restore')
  @HttpCode(HttpStatus.OK)
  @RequireGlobalPermissions(Permissions.ORGANIZATIONS_MANAGE)
  @ApiUuidParam('organizationId')
  @ApiNotFoundResponse({
    description: 'Organization not found or not deleted.',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'Another organization now uses the slug.',
    type: ErrorResponseDto,
  })
  restore(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ): Promise<OrganizationResponseDto> {
    return this.organizationsService.restore(organizationId);
  }
}
