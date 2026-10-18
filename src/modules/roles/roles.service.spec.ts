/* eslint-disable @typescript-eslint/unbound-method */
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DuplicateKeyError } from '../../database/errors';
import { Permissions } from '../shared/constants/permissions';
import { RoleScope, type Role } from '../shared/domain/role';
import type { IRoleRepository } from '../shared/repositories/role.repository.interface';
import type { AccessControlService } from '../shared/services/access-control.service';
import type { IOrganizationRepository } from '../organizations/repositories/organization.repository.interface';
import { RolesService } from './roles.service';

const ORG_ID = 'org-1';
const CALLER_ID = 'caller-1';

const role = (overrides: Partial<Role> = {}): Role => ({
  id: 'role-1',
  key: 'custom',
  name: 'Custom',
  description: null,
  scope: RoleScope.ORGANIZATION,
  organizationId: ORG_ID,
  isSystem: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('RolesService', () => {
  let service: RolesService;
  let roleRepository: jest.Mocked<IRoleRepository>;
  let organizationRepository: jest.Mocked<IOrganizationRepository>;
  let accessControlService: jest.Mocked<
    Pick<AccessControlService, 'assertHoldsAll'>
  >;

  beforeEach(() => {
    roleRepository = {
      findById: jest.fn(),
      exists: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
      listPlatform: jest.fn(),
      listVisibleToOrganization: jest.fn(),
      findPlatform: jest.fn(),
      findVisibleToOrganization: jest.fn(),
      findByIds: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      loadPermissionKeys: jest.fn().mockResolvedValue(new Map()),
      countAssignments: jest.fn().mockResolvedValue(0),
    };
    organizationRepository = {
      findById: jest.fn(),
      exists: jest.fn().mockResolvedValue(true),
      delete: jest.fn(),
    };
    accessControlService = {
      assertHoldsAll: jest.fn().mockResolvedValue(undefined),
    };
    service = new RolesService(
      roleRepository,
      organizationRepository,
      accessControlService as unknown as AccessControlService,
    );
  });

  describe('createOrganizationRole', () => {
    const dto = {
      key: 'custom',
      name: 'Custom',
      permissions: [Permissions.PROPERTIES_READ],
    };

    it('creates the role after the anti-escalation check', async () => {
      roleRepository.create.mockResolvedValue(role());

      const view = await service.createOrganizationRole(CALLER_ID, ORG_ID, dto);

      expect(accessControlService.assertHoldsAll).toHaveBeenCalledWith(
        CALLER_ID,
        ORG_ID,
        dto.permissions,
      );
      expect(roleRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'custom',
          organizationId: ORG_ID,
          scope: RoleScope.ORGANIZATION,
          isSystem: false,
        }),
        dto.permissions,
      );
      expect(view.key).toBe('custom');
    });

    it('maps a duplicate key to 409', async () => {
      roleRepository.create.mockRejectedValue(new DuplicateKeyError());

      await expect(
        service.createOrganizationRole(CALLER_ID, ORG_ID, dto),
      ).rejects.toThrow(ConflictException);
    });

    it('does not create anything when the caller lacks a permission', async () => {
      accessControlService.assertHoldsAll.mockRejectedValue(
        new ForbiddenException(),
      );

      await expect(
        service.createOrganizationRole(CALLER_ID, ORG_ID, dto),
      ).rejects.toThrow(ForbiddenException);
      expect(roleRepository.create).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown organization', async () => {
      organizationRepository.exists.mockResolvedValue(false);

      await expect(
        service.createOrganizationRole(CALLER_ID, ORG_ID, dto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('system roles', () => {
    beforeEach(() => {
      roleRepository.findPlatform.mockResolvedValue(
        role({ organizationId: null, isSystem: true }),
      );
    });

    it('cannot be updated', async () => {
      await expect(
        service.updatePlatformRole(CALLER_ID, 'role-1', { name: 'New' }),
      ).rejects.toThrow(ForbiddenException);
      expect(roleRepository.update).not.toHaveBeenCalled();
    });

    it('cannot be deleted', async () => {
      await expect(
        service.deletePlatformRole(CALLER_ID, 'role-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(roleRepository.delete).not.toHaveBeenCalled();
    });
  });

  describe('updateOrganizationRole', () => {
    it('checks the permissions being kept and added', async () => {
      roleRepository.findVisibleToOrganization.mockResolvedValue(role());
      roleRepository.loadPermissionKeys.mockResolvedValue(
        new Map([['role-1', [Permissions.PROPERTIES_READ]]]),
      );
      roleRepository.update.mockResolvedValue(role({ name: 'New' }));

      await service.updateOrganizationRole(CALLER_ID, ORG_ID, 'role-1', {
        name: 'New',
        permissions: [Permissions.ROLES_READ],
      });

      expect(accessControlService.assertHoldsAll).toHaveBeenCalledWith(
        CALLER_ID,
        ORG_ID,
        [Permissions.PROPERTIES_READ, Permissions.ROLES_READ],
      );
    });
  });

  describe('deleteOrganizationRole', () => {
    it('refuses a role that is still assigned', async () => {
      roleRepository.findVisibleToOrganization.mockResolvedValue(role());
      roleRepository.countAssignments.mockResolvedValue(2);

      await expect(
        service.deleteOrganizationRole(CALLER_ID, ORG_ID, 'role-1'),
      ).rejects.toThrow(ConflictException);
      expect(roleRepository.delete).not.toHaveBeenCalled();
    });
  });
});
