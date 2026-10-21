/* eslint-disable @typescript-eslint/unbound-method */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  DuplicateKeyError,
  MissingReferenceError,
} from '../../database/errors';
import type { RoleAssignmentsService } from '../roles/role-assignments.service';
import { RoleScope } from '../shared/domain/role';
import type { User } from '../users/domain/user';
import type { IUserRepository } from '../users/repositories/user.repository.interface';
import type { OrganizationMember } from './domain/organization-member';
import type { OrganizationMembership } from './domain/organization-membership';
import type { IMembershipRepository } from './repositories/membership.repository.interface';
import type { IOrganizationRepository } from './repositories/organization.repository.interface';
import { OrganizationMembersService } from './organization-members.service';

const CALLER_ID = 'caller-1';
const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const MEMBERSHIP_ID = 'membership-1';
const ROLE_ID = 'role-1';

const user: User = {
  id: USER_ID,
  email: 'jane@example.com',
  passwordHash: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const membership: OrganizationMembership = {
  id: MEMBERSHIP_ID,
  userId: USER_ID,
  organizationId: ORG_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const member: OrganizationMember = {
  userId: USER_ID,
  email: user.email,
  isActive: true,
  joinedAt: new Date(),
  roles: [
    {
      id: ROLE_ID,
      key: 'tenant',
      name: 'Tenant',
      description: null,
      scope: RoleScope.ORGANIZATION,
      organizationId: null,
      isSystem: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
};

describe('OrganizationMembersService', () => {
  let service: OrganizationMembersService;
  let organizationRepository: jest.Mocked<IOrganizationRepository>;
  let membershipRepository: jest.Mocked<IMembershipRepository>;
  let userRepository: jest.Mocked<IUserRepository>;
  let roleAssignmentsService: jest.Mocked<
    Pick<
      RoleAssignmentsService,
      'assertCanAssignMemberRoles' | 'assertCanRevokeMemberRoles'
    >
  >;

  beforeEach(() => {
    organizationRepository = {
      findById: jest.fn(),
      exists: jest.fn().mockResolvedValue(true),
      create: jest.fn(),
      update: jest.fn(),
      listAll: jest.fn(),
      listForUser: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn(),
    };
    membershipRepository = {
      findById: jest.fn(),
      exists: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
      findByOrganizationAndUser: jest.fn(),
      createWithRoles: jest.fn().mockResolvedValue(membership),
      findMember: jest.fn().mockResolvedValue(member),
      listMembers: jest.fn(),
    };
    userRepository = {
      findById: jest.fn(),
      exists: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
      findByEmail: jest.fn().mockResolvedValue(user),
    };
    roleAssignmentsService = {
      assertCanAssignMemberRoles: jest.fn().mockResolvedValue(undefined),
      assertCanRevokeMemberRoles: jest.fn().mockResolvedValue(undefined),
    };
    service = new OrganizationMembersService(
      organizationRepository,
      membershipRepository,
      userRepository,
      roleAssignmentsService as unknown as RoleAssignmentsService,
    );
  });

  describe('addMember', () => {
    const dto = { email: ' Jane@Example.com ', roleIds: [ROLE_ID] };

    it('creates the membership with its roles and returns the member view', async () => {
      const view = await service.addMember(CALLER_ID, ORG_ID, dto);

      expect(userRepository.findByEmail).toHaveBeenCalledWith(
        'jane@example.com',
      );
      expect(
        roleAssignmentsService.assertCanAssignMemberRoles,
      ).toHaveBeenCalledWith(CALLER_ID, ORG_ID, [ROLE_ID]);
      expect(membershipRepository.createWithRoles).toHaveBeenCalledWith(
        ORG_ID,
        USER_ID,
        [ROLE_ID],
      );
      expect(view).toEqual({
        userId: USER_ID,
        email: user.email,
        isActive: true,
        joinedAt: member.joinedAt,
        roles: [
          {
            id: ROLE_ID,
            key: 'tenant',
            name: 'Tenant',
            scope: RoleScope.ORGANIZATION,
            organizationId: null,
          },
        ],
      });
    });

    it('answers 404 for an unknown organization', async () => {
      organizationRepository.exists.mockResolvedValue(false);

      await expect(service.addMember(CALLER_ID, ORG_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(membershipRepository.createWithRoles).not.toHaveBeenCalled();
    });

    it('answers 404 for an unknown email', async () => {
      userRepository.findByEmail.mockResolvedValue(null);

      await expect(service.addMember(CALLER_ID, ORG_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(membershipRepository.createWithRoles).not.toHaveBeenCalled();
    });

    it('answers 409 when the user is already a member', async () => {
      membershipRepository.createWithRoles.mockRejectedValue(
        new DuplicateKeyError(),
      );

      await expect(service.addMember(CALLER_ID, ORG_ID, dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('answers 400 when a role was deleted before the insert', async () => {
      membershipRepository.createWithRoles.mockRejectedValue(
        new MissingReferenceError(),
      );

      await expect(service.addMember(CALLER_ID, ORG_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('does not add anyone when a role is unassignable (400)', async () => {
      roleAssignmentsService.assertCanAssignMemberRoles.mockRejectedValue(
        new BadRequestException(),
      );

      await expect(service.addMember(CALLER_ID, ORG_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(membershipRepository.createWithRoles).not.toHaveBeenCalled();
    });

    it('does not add anyone when the caller would escalate (403)', async () => {
      roleAssignmentsService.assertCanAssignMemberRoles.mockRejectedValue(
        new ForbiddenException(),
      );

      await expect(service.addMember(CALLER_ID, ORG_ID, dto)).rejects.toThrow(
        ForbiddenException,
      );
      expect(membershipRepository.createWithRoles).not.toHaveBeenCalled();
    });
  });

  describe('listMembers', () => {
    it('lists the organization’s members with the page echoed back', async () => {
      membershipRepository.listMembers.mockResolvedValue({
        items: [member],
        total: 7,
      });

      const page = await service.listMembers(ORG_ID, { limit: 5, offset: 0 });

      expect(membershipRepository.listMembers).toHaveBeenCalledWith(ORG_ID, {
        limit: 5,
        offset: 0,
      });
      expect(page).toMatchObject({ total: 7, limit: 5, offset: 0 });
      expect(page.items).toHaveLength(1);
    });

    it('answers 404 for an unknown organization', async () => {
      organizationRepository.exists.mockResolvedValue(false);

      await expect(
        service.listMembers(ORG_ID, { limit: 5, offset: 0 }),
      ).rejects.toThrow(NotFoundException);
      expect(membershipRepository.listMembers).not.toHaveBeenCalled();
    });
  });

  describe('removeMember', () => {
    beforeEach(() => {
      membershipRepository.findByOrganizationAndUser.mockResolvedValue(
        membership,
      );
    });

    it('removes the membership after the revoke check', async () => {
      await service.removeMember(CALLER_ID, ORG_ID, USER_ID);

      expect(
        membershipRepository.findByOrganizationAndUser,
      ).toHaveBeenCalledWith(ORG_ID, USER_ID);
      expect(
        roleAssignmentsService.assertCanRevokeMemberRoles,
      ).toHaveBeenCalledWith(CALLER_ID, ORG_ID, MEMBERSHIP_ID);
      expect(membershipRepository.delete).toHaveBeenCalledWith(MEMBERSHIP_ID);
    });

    it('answers 404 when the user is not a member', async () => {
      membershipRepository.findByOrganizationAndUser.mockResolvedValue(null);

      await expect(
        service.removeMember(CALLER_ID, ORG_ID, USER_ID),
      ).rejects.toThrow(NotFoundException);
      expect(membershipRepository.delete).not.toHaveBeenCalled();
    });

    it('answers 404 for an unknown organization', async () => {
      organizationRepository.exists.mockResolvedValue(false);

      await expect(
        service.removeMember(CALLER_ID, ORG_ID, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('keeps the member when the caller lacks a permission of their roles (403)', async () => {
      roleAssignmentsService.assertCanRevokeMemberRoles.mockRejectedValue(
        new ForbiddenException(),
      );

      await expect(
        service.removeMember(CALLER_ID, ORG_ID, USER_ID),
      ).rejects.toThrow(ForbiddenException);
      expect(membershipRepository.delete).not.toHaveBeenCalled();
    });
  });
});
