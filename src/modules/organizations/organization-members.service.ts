import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DuplicateKeyError,
  MissingReferenceError,
} from '../../database/errors';
import type { PageRequest } from '../../database/repository.interface';
import type { RoleSummary } from '../roles/role-assignments.service';
import { RoleAssignmentsService } from '../roles/role-assignments.service';
import {
  USER_REPOSITORY,
  type IUserRepository,
} from '../users/repositories/user.repository.interface';
import type { OrganizationMember } from './domain/organization-member';
import type { AddMemberDto } from './dto/add-member.dto';
import {
  MEMBERSHIP_REPOSITORY,
  type IMembershipRepository,
} from './repositories/membership.repository.interface';
import {
  ORGANIZATION_REPOSITORY,
  type IOrganizationRepository,
} from './repositories/organization.repository.interface';

export interface MemberView {
  userId: string;
  email: string;
  isActive: boolean;
  joinedAt: Date;
  roles: RoleSummary[];
}

export interface MemberPage extends PageRequest {
  items: MemberView[];
  total: number;
}

/**
 * Who belongs to an organization. Every query is scoped by `organizationId`,
 * and adding or removing a member passes the anti-escalation check for the
 * roles involved. Changing a member's roles later is `PUT .../roles`.
 */
@Injectable()
export class OrganizationMembersService {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: IOrganizationRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepository: IMembershipRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    private readonly roleAssignmentsService: RoleAssignmentsService,
  ) {}

  /** Adds an existing user (looked up by email) with their initial roles. */
  async addMember(
    callerId: string,
    organizationId: string,
    dto: AddMemberDto,
  ): Promise<MemberView> {
    await this.assertOrganizationExists(organizationId);

    const user = await this.userRepository.findByEmail(
      dto.email.trim().toLowerCase(),
    );
    if (!user) {
      throw new NotFoundException('No user is registered with that email.');
    }

    await this.roleAssignmentsService.assertCanAssignMemberRoles(
      callerId,
      organizationId,
      dto.roleIds,
    );

    try {
      await this.membershipRepository.createWithRoles(
        organizationId,
        user.id,
        dto.roleIds,
      );
    } catch (error) {
      if (error instanceof DuplicateKeyError) {
        throw new ConflictException(
          'User is already a member of this organization.',
        );
      }
      // A role or the user was deleted between the checks and the insert.
      if (error instanceof MissingReferenceError) {
        throw new BadRequestException(
          'A role or the user no longer exists; retry the request.',
        );
      }
      throw error;
    }

    const member = await this.membershipRepository.findMember(
      organizationId,
      user.id,
    );
    if (!member) {
      throw new NotFoundException('User is not a member of this organization.');
    }

    return this.toView(member);
  }

  async listMembers(
    organizationId: string,
    page: PageRequest,
  ): Promise<MemberPage> {
    await this.assertOrganizationExists(organizationId);

    const { items, total } = await this.membershipRepository.listMembers(
      organizationId,
      page,
    );

    return {
      items: items.map((member) => this.toView(member)),
      total,
      limit: page.limit,
      offset: page.offset,
    };
  }

  /** The caller must hold every permission of the roles the member loses. */
  async removeMember(
    callerId: string,
    organizationId: string,
    userId: string,
  ): Promise<void> {
    await this.assertOrganizationExists(organizationId);

    const membership =
      await this.membershipRepository.findByOrganizationAndUser(
        organizationId,
        userId,
      );
    if (!membership) {
      throw new NotFoundException('User is not a member of this organization.');
    }

    await this.roleAssignmentsService.assertCanRevokeMemberRoles(
      callerId,
      organizationId,
      membership.id,
    );

    await this.membershipRepository.delete(membership.id);
  }

  private async assertOrganizationExists(
    organizationId: string,
  ): Promise<void> {
    if (!(await this.organizationRepository.exists(organizationId))) {
      throw new NotFoundException('Organization not found.');
    }
  }

  private toView(member: OrganizationMember): MemberView {
    return {
      userId: member.userId,
      email: member.email,
      isActive: member.isActive,
      joinedAt: member.joinedAt,
      roles: member.roles.map((role) => ({
        id: role.id,
        key: role.key,
        name: role.name,
        scope: role.scope,
        organizationId: role.organizationId,
      })),
    };
  }
}
