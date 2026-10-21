import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, IsNull } from 'typeorm';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/config/app-setup';
import { RoleEntity } from './../src/database/typeorm/entities/role.entity';
import { UserGlobalRoleEntity } from './../src/database/typeorm/entities/user-global-role.entity';
import { Permissions } from './../src/modules/shared/constants/permissions';
import {
  SystemRole,
  SystemRoles,
} from './../src/modules/shared/constants/system-roles';

interface OrganizationBody {
  id: string;
  slug: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface OrganizationListBody {
  items: OrganizationBody[];
  total: number;
  limit: number;
  offset: number;
}

interface MemberBody {
  userId: string;
  email: string;
  isActive: boolean;
  roles: { id: string; key: string }[];
}

interface MemberListBody {
  items: MemberBody[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Requires a migrated and seeded database (`npm run migration:run && npm run seed`).
 * Every run registers fresh users and creates fresh organizations.
 */
describe('Organizations (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const password = 'e2e-password-123';
  const unique = () =>
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const http = () => request(app.getHttpServer());
  const bearer = (user: { token: string }) => `Bearer ${user.token}`;

  /** Registers and logs in a user; returns its id, email and access token. */
  const createUser = async (label: string) => {
    const email = `e2e-${label}-${unique()}@example.com`;
    const registered = await http()
      .post('/api/auth/register')
      .send({ email, password })
      .expect(201);
    const login = await http()
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    return {
      id: (registered.body as { id: string }).id,
      email,
      token: (login.body as { accessToken: string }).accessToken,
    };
  };

  const systemRole = (key: SystemRole) =>
    dataSource
      .getRepository(RoleEntity)
      .findOneByOrFail({ key, organizationId: IsNull() });

  const createAdmin = async (label: string) => {
    const admin = await createUser(label);
    const role = await systemRole(SystemRoles.PLATFORM_ADMIN);
    await dataSource
      .getRepository(UserGlobalRoleEntity)
      .insert({ userId: admin.id, roleId: role.id });
    return admin;
  };

  type TestUser = Awaited<ReturnType<typeof createUser>>;

  const orgPath = (organizationId: string, path = '') =>
    `/api/organizations/${organizationId}${path}`;

  const createOrganization = async (admin: TestUser, slug?: string) => {
    const response = await http()
      .post('/api/organizations')
      .set('Authorization', bearer(admin))
      .send({ name: 'E2E Org', slug: slug ?? `e2e-org-${unique()}` })
      .expect(201);
    return response.body as OrganizationBody;
  };

  const addMember = (
    admin: TestUser,
    organizationId: string,
    email: string,
    roleIds: string[],
  ) =>
    http()
      .post(orgPath(organizationId, '/members'))
      .set('Authorization', bearer(admin))
      .send({ email, roleIds });

  const myOrganizationIds = async (user: TestUser) => {
    const me = await http()
      .get('/api/users/me')
      .set('Authorization', bearer(user))
      .expect(200);
    return (
      me.body as { organizations: { organizationId: string }[] }
    ).organizations.map(({ organizationId }) => organizationId);
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('create', () => {
    it('a platform admin creates an organization; the slug must be unique', async () => {
      const admin = await createAdmin('create-admin');
      const slug = `e2e-org-${unique()}`;

      const created = await http()
        .post('/api/organizations')
        .set('Authorization', bearer(admin))
        .send({ name: 'Sunrise', slug })
        .expect(201);
      expect(created.body).toMatchObject({
        slug,
        name: 'Sunrise',
        deletedAt: null,
      });

      await http()
        .post('/api/organizations')
        .set('Authorization', bearer(admin))
        .send({ name: 'Again', slug })
        .expect(409);
    });

    it('rejects a malformed slug with 400', async () => {
      const admin = await createAdmin('create-invalid');

      for (const slug of ['Upper-Case', 'has space', '-lead', 'a--b', 'ab']) {
        await http()
          .post('/api/organizations')
          .set('Authorization', bearer(admin))
          .send({ name: 'Bad', slug })
          .expect(400);
      }
    });

    it('requires the global organizations.manage permission', async () => {
      const admin = await createAdmin('create-gate-admin');
      const org = await createOrganization(admin);
      const manager = await createUser('create-gate-manager');
      const managerRole = await systemRole(SystemRoles.PROPERTY_MANAGER);
      await addMember(admin, org.id, manager.email, [managerRole.id]).expect(
        201,
      );

      // Even an org manager cannot create organizations.
      await http()
        .post('/api/organizations')
        .set('Authorization', bearer(manager))
        .send({ name: 'Nope', slug: `e2e-org-${unique()}` })
        .expect(403);
    });
  });

  describe('members and access', () => {
    let admin: TestUser;
    let manager: TestUser;
    let outsider: TestUser;
    let org: OrganizationBody;
    let managerRoleId: string;
    let tenantRoleId: string;

    beforeAll(async () => {
      admin = await createAdmin('members-admin');
      manager = await createUser('members-manager');
      outsider = await createUser('members-outsider');
      managerRoleId = (await systemRole(SystemRoles.PROPERTY_MANAGER)).id;
      tenantRoleId = (await systemRole(SystemRoles.TENANT)).id;
      org = await createOrganization(admin);
    });

    it('the creator does not become a member', async () => {
      expect(await myOrganizationIds(admin)).not.toContain(org.id);
    });

    it('an admin adds a registered user as property_manager', async () => {
      const added = await addMember(
        admin,
        org.id,
        manager.email.toUpperCase(),
        [managerRoleId],
      ).expect(201);

      expect(added.body).toMatchObject({
        userId: manager.id,
        email: manager.email,
        isActive: true,
        roles: [{ key: SystemRoles.PROPERTY_MANAGER }],
      });
      expect(await myOrganizationIds(manager)).toContain(org.id);
    });

    it('answers 409 for a repeated member, 404 for an unknown email or org', async () => {
      await addMember(admin, org.id, manager.email, []).expect(409);
      await addMember(
        admin,
        org.id,
        `nobody-${unique()}@example.com`,
        [],
      ).expect(404);
      await addMember(
        admin,
        '00000000-0000-4000-8000-000000000000',
        manager.email,
        [],
      ).expect(404);
    });

    it('answers 400 for an unknown role and for another organization’s custom role', async () => {
      await addMember(admin, org.id, outsider.email, [
        '00000000-0000-4000-8000-000000000000',
      ]).expect(400);

      const otherOrg = await createOrganization(admin);
      const customRole = await http()
        .post(orgPath(otherOrg.id, '/roles'))
        .set('Authorization', bearer(admin))
        .send({
          key: `custom_${unique().replace(/\W/g, '_')}`,
          name: 'Custom',
          permissions: [Permissions.PROPERTIES_READ],
        })
        .expect(201);
      await addMember(admin, org.id, outsider.email, [
        (customRole.body as { id: string }).id,
      ]).expect(400);
    });

    it('the member can read and update the organization but not delete it', async () => {
      await http()
        .get(orgPath(org.id))
        .set('Authorization', bearer(manager))
        .expect(200)
        .expect(({ body }) => {
          expect((body as OrganizationBody).id).toBe(org.id);
        });

      await http()
        .patch(orgPath(org.id))
        .set('Authorization', bearer(manager))
        .send({ name: 'Renamed' })
        .expect(200)
        .expect(({ body }) => {
          expect((body as OrganizationBody).name).toBe('Renamed');
        });

      await http()
        .delete(orgPath(org.id))
        .set('Authorization', bearer(manager))
        .expect(403);
      await http()
        .post(orgPath(org.id, '/restore'))
        .set('Authorization', bearer(manager))
        .expect(403);
    });

    it('PATCH answers 409 when the slug belongs to another organization', async () => {
      const other = await createOrganization(admin);

      await http()
        .patch(orgPath(org.id))
        .set('Authorization', bearer(admin))
        .send({ slug: other.slug })
        .expect(409);
      await http()
        .patch(orgPath(org.id))
        .set('Authorization', bearer(admin))
        .send({ slug: 'Not Valid' })
        .expect(400);
    });

    it('a non-member gets 403 on the organization and its members', async () => {
      for (const path of ['', '/members']) {
        await http()
          .get(orgPath(org.id, path))
          .set('Authorization', bearer(outsider))
          .expect(403);
      }
      await http()
        .patch(orgPath(org.id))
        .set('Authorization', bearer(outsider))
        .send({ name: 'Hijack' })
        .expect(403);
    });

    it('lists members with roles, paginated', async () => {
      const tenant = await createUser('members-tenant');
      await addMember(manager, org.id, tenant.email, [tenantRoleId]).expect(
        201,
      );

      const all = await http()
        .get(orgPath(org.id, '/members'))
        .set('Authorization', bearer(manager))
        .expect(200);
      const list = all.body as MemberListBody;
      expect(list).toMatchObject({ total: 2, limit: 20, offset: 0 });
      expect(list.items.map((member) => member.userId)).toEqual([
        manager.id,
        tenant.id,
      ]);
      expect(list.items[1].roles.map((role) => role.key)).toEqual([
        SystemRoles.TENANT,
      ]);

      const page = await http()
        .get(orgPath(org.id, '/members?limit=1&offset=1'))
        .set('Authorization', bearer(manager))
        .expect(200);
      expect(page.body).toMatchObject({ total: 2, limit: 1, offset: 1 });
      expect((page.body as MemberListBody).items).toHaveLength(1);

      await http()
        .get(orgPath(org.id, '/members?limit=0'))
        .set('Authorization', bearer(manager))
        .expect(400);
      await http()
        .get(orgPath(org.id, '/members?limit=101'))
        .set('Authorization', bearer(manager))
        .expect(400);

      // A tenant cannot manage members.
      await http()
        .get(orgPath(org.id, '/members'))
        .set('Authorization', bearer(tenant))
        .expect(403);
      await http()
        .delete(orgPath(org.id, `/members/${manager.id}`))
        .set('Authorization', bearer(tenant))
        .expect(403);
    });

    it('members cannot be added or removed beyond the caller’s own permissions', async () => {
      // An org manager who can add members but holds no property management permissions.
      const limitedRole = await http()
        .post(orgPath(org.id, '/roles'))
        .set('Authorization', bearer(manager))
        .send({
          key: `members_only_${unique().replace(/\W/g, '_')}`,
          name: 'Members only',
          permissions: [
            Permissions.ORGANIZATIONS_MANAGE,
            Permissions.ORGANIZATIONS_READ,
            Permissions.PROPERTIES_READ,
            Permissions.ROLES_MANAGE,
          ],
        })
        .expect(201);
      const limited = await createUser('members-limited');
      await addMember(admin, org.id, limited.email, [
        (limitedRole.body as { id: string }).id,
      ]).expect(201);

      // Cannot hand out property_manager, which is stronger than itself...
      const newcomer = await createUser('members-newcomer');
      await addMember(limited, org.id, newcomer.email, [managerRoleId]).expect(
        403,
      );
      // ...cannot remove a stronger member...
      await http()
        .delete(orgPath(org.id, `/members/${manager.id}`))
        .set('Authorization', bearer(limited))
        .expect(403);
      // ...but can add and remove a member with a role within its permissions.
      const viewerRole = await systemRole(SystemRoles.VIEWER);
      await addMember(limited, org.id, newcomer.email, [viewerRole.id]).expect(
        201,
      );
      await http()
        .delete(orgPath(org.id, `/members/${newcomer.id}`))
        .set('Authorization', bearer(limited))
        .expect(204);
    });

    it('removing a member revokes access; unknown members answer 404', async () => {
      const leaver = await createUser('members-leaver');
      await addMember(admin, org.id, leaver.email, [tenantRoleId]).expect(201);
      await http()
        .get(orgPath(org.id))
        .set('Authorization', bearer(leaver))
        .expect(200);

      await http()
        .delete(orgPath(org.id, `/members/${leaver.id}`))
        .set('Authorization', bearer(manager))
        .expect(204);
      await http()
        .get(orgPath(org.id))
        .set('Authorization', bearer(leaver))
        .expect(403);
      await http()
        .delete(orgPath(org.id, `/members/${leaver.id}`))
        .set('Authorization', bearer(manager))
        .expect(404);
    });
  });

  describe('listing', () => {
    it('scopes the list to the caller’s memberships unless they hold the global read', async () => {
      const admin = await createAdmin('list-admin');
      const member = await createUser('list-member');
      const own = await createOrganization(admin);
      const foreign = await createOrganization(admin);
      const tenantRole = await systemRole(SystemRoles.TENANT);
      await addMember(admin, own.id, member.email, [tenantRole.id]).expect(201);

      const mine = await http()
        .get('/api/organizations')
        .set('Authorization', bearer(member))
        .expect(200);
      expect(mine.body).toMatchObject({ total: 1, limit: 20, offset: 0 });
      expect(
        (mine.body as OrganizationListBody).items.map(({ id }) => id),
      ).toEqual([own.id]);

      const everything = await http()
        .get('/api/organizations?limit=100')
        .set('Authorization', bearer(admin))
        .expect(200);
      const ids = (everything.body as OrganizationListBody).items.map(
        ({ id }) => id,
      );
      expect(ids).toEqual(expect.arrayContaining([own.id, foreign.id]));

      const paged = await http()
        .get('/api/organizations?limit=1&offset=1')
        .set('Authorization', bearer(admin))
        .expect(200);
      expect((paged.body as OrganizationListBody).items).toHaveLength(1);
      expect((paged.body as OrganizationListBody).total).toBeGreaterThan(1);
    });

    it('includeDeleted needs the global read and validates its value', async () => {
      const admin = await createAdmin('list-deleted-admin');
      const member = await createUser('list-deleted-member');
      const org = await createOrganization(admin);
      await http()
        .delete(orgPath(org.id))
        .set('Authorization', bearer(admin))
        .expect(204);

      await http()
        .get('/api/organizations?includeDeleted=true')
        .set('Authorization', bearer(member))
        .expect(403);
      await http()
        .get('/api/organizations?includeDeleted=maybe')
        .set('Authorization', bearer(admin))
        .expect(400);

      const without = await http()
        .get('/api/organizations?limit=100')
        .set('Authorization', bearer(admin))
        .expect(200);
      expect(
        (without.body as OrganizationListBody).items.map(({ id }) => id),
      ).not.toContain(org.id);

      const withDeleted = await http()
        .get('/api/organizations?includeDeleted=true&limit=100')
        .set('Authorization', bearer(admin))
        .expect(200);
      const deleted = (withDeleted.body as OrganizationListBody).items.find(
        ({ id }) => id === org.id,
      );
      expect(deleted?.deletedAt).not.toBeNull();
    });

    it('requires a token', async () => {
      await http().get('/api/organizations').expect(401);
    });
  });

  describe('soft delete and restore', () => {
    let admin: TestUser;
    let manager: TestUser;
    let org: OrganizationBody;

    beforeEach(async () => {
      admin = await createAdmin('delete-admin');
      manager = await createUser('delete-manager');
      org = await createOrganization(admin);
      const managerRole = await systemRole(SystemRoles.PROPERTY_MANAGER);
      await addMember(admin, org.id, manager.email, [managerRole.id]).expect(
        201,
      );
    });

    it('deleting hides the organization; restoring brings access back', async () => {
      expect(await myOrganizationIds(manager)).toContain(org.id);

      await http()
        .delete(orgPath(org.id))
        .set('Authorization', bearer(admin))
        .expect(204);

      // The member loses every permission there and the org vanishes from /users/me.
      await http()
        .get(orgPath(org.id))
        .set('Authorization', bearer(manager))
        .expect(403);
      expect(await myOrganizationIds(manager)).not.toContain(org.id);
      const permissions = await http()
        .get(`/api/users/me/permissions?organizationId=${org.id}`)
        .set('Authorization', bearer(manager))
        .expect(200);
      expect(
        (permissions.body as { permissions: string[] }).permissions,
      ).toEqual([]);

      // Admins get 404 on every org route, including nested ones.
      for (const path of ['', '/members', '/roles']) {
        await http()
          .get(orgPath(org.id, path))
          .set('Authorization', bearer(admin))
          .expect(404);
      }
      await http()
        .patch(orgPath(org.id))
        .set('Authorization', bearer(admin))
        .send({ name: 'Ghost' })
        .expect(404);
      await http()
        .delete(orgPath(org.id))
        .set('Authorization', bearer(admin))
        .expect(404);

      const restored = await http()
        .post(orgPath(org.id, '/restore'))
        .set('Authorization', bearer(admin))
        .expect(200);
      expect((restored.body as OrganizationBody).deletedAt).toBeNull();

      await http()
        .get(orgPath(org.id))
        .set('Authorization', bearer(manager))
        .expect(200);
      expect(await myOrganizationIds(manager)).toContain(org.id);
    });

    it('restoring a live or unknown organization answers 404', async () => {
      await http()
        .post(orgPath(org.id, '/restore'))
        .set('Authorization', bearer(admin))
        .expect(404);
      await http()
        .post(orgPath('00000000-0000-4000-8000-000000000000', '/restore'))
        .set('Authorization', bearer(admin))
        .expect(404);
    });

    it('a deleted organization frees its slug, which then blocks the restore', async () => {
      await http()
        .delete(orgPath(org.id))
        .set('Authorization', bearer(admin))
        .expect(204);

      const reused = await createOrganization(admin, org.slug);
      expect(reused.id).not.toBe(org.id);

      await http()
        .post(orgPath(org.id, '/restore'))
        .set('Authorization', bearer(admin))
        .expect(409);

      // Renaming the squatter makes the restore possible.
      await http()
        .patch(orgPath(reused.id))
        .set('Authorization', bearer(admin))
        .send({ slug: `${org.slug}-2` })
        .expect(200);
      await http()
        .post(orgPath(org.id, '/restore'))
        .set('Authorization', bearer(admin))
        .expect(200);
    });
  });
});
