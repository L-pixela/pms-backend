/* eslint-disable @typescript-eslint/unbound-method */
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DuplicateKeyError } from '../../database/errors';
import { Permissions, type Permission } from '../shared/constants/permissions';
import type { AccessControlService } from '../shared/services/access-control.service';
import type { Organization } from './domain/organization';
import type { IOrganizationRepository } from './repositories/organization.repository.interface';
import { OrganizationsService } from './organizations.service';

const CALLER_ID = 'caller-1';
const ORG_ID = 'org-1';

const organization = (overrides: Partial<Organization> = {}): Organization => ({
  id: ORG_ID,
  slug: 'sunrise',
  name: 'Sunrise',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...overrides,
});

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let organizationRepository: jest.Mocked<IOrganizationRepository>;
  let accessControlService: jest.Mocked<
    Pick<AccessControlService, 'getEffectivePermissions'>
  >;

  const grantGlobally = (...permissions: Permission[]) =>
    accessControlService.getEffectivePermissions.mockResolvedValue(
      new Set(permissions),
    );

  beforeEach(() => {
    organizationRepository = {
      findById: jest.fn(),
      exists: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      listAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      listForUser: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      softDelete: jest.fn(),
      restore: jest.fn(),
    };
    accessControlService = {
      getEffectivePermissions: jest.fn().mockResolvedValue(new Set()),
    };
    service = new OrganizationsService(
      organizationRepository,
      accessControlService as unknown as AccessControlService,
    );
  });

  describe('create', () => {
    it('creates the organization', async () => {
      organizationRepository.create.mockResolvedValue(organization());

      const created = await service.create({
        name: 'Sunrise',
        slug: 'sunrise',
      });

      expect(organizationRepository.create).toHaveBeenCalledWith({
        name: 'Sunrise',
        slug: 'sunrise',
      });
      expect(created.slug).toBe('sunrise');
    });

    it('maps a duplicate slug to 409', async () => {
      organizationRepository.create.mockRejectedValue(new DuplicateKeyError());

      await expect(
        service.create({ name: 'Sunrise', slug: 'sunrise' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('list', () => {
    const query = { limit: 10, offset: 5 };

    it('lists every organization for a global organizations.read holder', async () => {
      grantGlobally(Permissions.ORGANIZATIONS_READ);
      organizationRepository.listAll.mockResolvedValue({
        items: [organization()],
        total: 1,
      });

      const page = await service.list(CALLER_ID, query);

      expect(organizationRepository.listAll).toHaveBeenCalledWith(
        { limit: 10, offset: 5 },
        { includeDeleted: false },
      );
      expect(organizationRepository.listForUser).not.toHaveBeenCalled();
      expect(accessControlService.getEffectivePermissions).toHaveBeenCalledWith(
        CALLER_ID,
        null,
      );
      expect(page).toMatchObject({ total: 1, limit: 10, offset: 5 });
    });

    it('includes deleted organizations for a global reader who asks', async () => {
      grantGlobally(Permissions.ORGANIZATIONS_READ);

      await service.list(CALLER_ID, { ...query, includeDeleted: true });

      expect(organizationRepository.listAll).toHaveBeenCalledWith(
        expect.anything(),
        { includeDeleted: true },
      );
    });

    it('lists only the caller’s organizations without the global permission', async () => {
      grantGlobally(Permissions.PROPERTIES_READ);

      await service.list(CALLER_ID, query);

      expect(organizationRepository.listForUser).toHaveBeenCalledWith(
        CALLER_ID,
        { limit: 10, offset: 5 },
      );
      expect(organizationRepository.listAll).not.toHaveBeenCalled();
    });

    it('answers 403 to includeDeleted without the global permission', async () => {
      await expect(
        service.list(CALLER_ID, { ...query, includeDeleted: true }),
      ).rejects.toThrow(ForbiddenException);
      expect(organizationRepository.listForUser).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('returns the organization', async () => {
      organizationRepository.findById.mockResolvedValue(organization());

      await expect(service.get(ORG_ID)).resolves.toMatchObject({ id: ORG_ID });
    });

    it('answers 404 when missing or deleted', async () => {
      organizationRepository.findById.mockResolvedValue(null);

      await expect(service.get(ORG_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('passes only the given fields', async () => {
      organizationRepository.update.mockResolvedValue(
        organization({ name: 'New' }),
      );

      const updated = await service.update(ORG_ID, { name: 'New' });

      expect(organizationRepository.update).toHaveBeenCalledWith(ORG_ID, {
        name: 'New',
        slug: undefined,
      });
      expect(updated.name).toBe('New');
    });

    it('maps a duplicate slug to 409', async () => {
      organizationRepository.update.mockRejectedValue(new DuplicateKeyError());

      await expect(service.update(ORG_ID, { slug: 'taken' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('answers 404 when missing or deleted', async () => {
      organizationRepository.update.mockResolvedValue(null);

      await expect(service.update(ORG_ID, { name: 'New' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('softDelete', () => {
    it('soft-deletes a live organization', async () => {
      organizationRepository.softDelete.mockResolvedValue(true);

      await expect(service.softDelete(ORG_ID)).resolves.toBeUndefined();
      expect(organizationRepository.softDelete).toHaveBeenCalledWith(ORG_ID);
    });

    it('answers 404 when missing or already deleted', async () => {
      organizationRepository.softDelete.mockResolvedValue(false);

      await expect(service.softDelete(ORG_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('restore', () => {
    it('returns the restored organization', async () => {
      organizationRepository.restore.mockResolvedValue(organization());

      await expect(service.restore(ORG_ID)).resolves.toMatchObject({
        id: ORG_ID,
      });
    });

    it('answers 404 when missing or not deleted', async () => {
      organizationRepository.restore.mockResolvedValue(null);

      await expect(service.restore(ORG_ID)).rejects.toThrow(NotFoundException);
    });

    it('answers 409 when the slug is taken again', async () => {
      organizationRepository.restore.mockRejectedValue(new DuplicateKeyError());

      await expect(service.restore(ORG_ID)).rejects.toThrow(ConflictException);
    });
  });
});
