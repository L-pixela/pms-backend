import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Permissions } from '../shared/constants/permissions';
import { ApiUuidParam } from '../shared/decorators/api-uuid-param.decorator';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { RequirePermissions } from '../shared/decorators/require-permissions.decorator';
import { PaginationQueryDto } from '../shared/dto/pagination-query.dto';
import { ErrorResponseDto } from '../shared/dto/error-response.dto';
import { AddMemberDto } from './dto/add-member.dto';
import {
  OrganizationMemberListResponseDto,
  OrganizationMemberResponseDto,
} from './dto/organization-member.response';
import { OrganizationMembersService } from './organization-members.service';

/**
 * Membership of one organization. A member's roles change through
 * `PUT /organizations/:organizationId/members/:userId/roles`.
 */
@ApiTags('Organization members')
@ApiUuidParam('organizationId')
@Controller('organizations/:organizationId/members')
export class OrganizationMembersController {
  constructor(
    private readonly organizationMembersService: OrganizationMembersService,
  ) {}

  /** Add an existing user, found by email, with their initial roles. */
  @Post()
  @RequirePermissions(
    Permissions.ORGANIZATIONS_MANAGE,
    Permissions.ROLES_MANAGE,
  )
  @ApiNotFoundResponse({
    description: 'Organization not found or no user has that email.',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'User is already a member.',
    type: ErrorResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'A role is unknown or cannot be assigned in this organization.',
    type: ErrorResponseDto,
  })
  add(
    @CurrentUser('id') callerId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() payload: AddMemberDto,
  ): Promise<OrganizationMemberResponseDto> {
    return this.organizationMembersService.addMember(
      callerId,
      organizationId,
      payload,
    );
  }

  /** List the members with their roles. */
  @Get()
  @RequirePermissions(Permissions.ORGANIZATIONS_MANAGE)
  @ApiNotFoundResponse({
    description: 'Organization not found.',
    type: ErrorResponseDto,
  })
  list(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<OrganizationMemberListResponseDto> {
    return this.organizationMembersService.listMembers(organizationId, {
      limit: query.limit,
      offset: query.offset,
    });
  }

  /** Remove a member. The caller must hold every permission of the member's roles. */
  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permissions.ORGANIZATIONS_MANAGE)
  @ApiUuidParam('userId')
  @ApiNoContentResponse({ description: 'Member removed.' })
  @ApiNotFoundResponse({
    description: 'Organization not found or user is not a member.',
    type: ErrorResponseDto,
  })
  remove(
    @CurrentUser('id') callerId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    return this.organizationMembersService.removeMember(
      callerId,
      organizationId,
      userId,
    );
  }
}
