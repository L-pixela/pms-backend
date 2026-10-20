import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, IsNull } from 'typeorm';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/config/app-setup';
import { OrganizationMembershipRoleEntity } from './../src/database/typeorm/entities/organization-membership-role.entity';
import { OrganizationMembershipEntity } from './../src/database/typeorm/entities/organization-membership.entity';
import { OrganizationEntity } from './../src/database/typeorm/entities/organization.entity';
import { Permissions } from './../src/modules/shared/constants/permissions';
import {
  SystemRole,
  SystemRoles,
} from './../src/modules/shared/constants/system-roles';
import { RoleEntity } from './../src/database/typeorm/entities/role.entity';
import { UserGlobalRoleEntity } from './../src/database/typeorm/entities/user-global-role.entity';
import { UserEntity } from './../src/database/typeorm/entities/user.entity';

interface RoleBody {
  id: string;
  key: string;
  organizationId: string | null;
  permissions: string[];
}

/**
 * Requires a migrated and seeded database (`npm run migration:run && npm run seed`).
 * Every run registers fresh users and orgs, so it can be repeated against the same DB.
 */
describe('Auth & RBAC (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const password = 'e2e-password-123';
  const unique = () =>
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const uniqueEmail = (label: string) => `e2e-${label}-${unique()}@example.com`;

  const http = () => request(app.getHttpServer());

  const register = (email: string) =>
    http().post('/api/auth/register').send({ email, password });

  const login = async (email: string) => {
    const response = await http()
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    return response.body as { accessToken: string; refreshToken: string };
  };

  const refresh = (refreshToken: string) =>
    http().post('/api/auth/refresh').send({ refreshToken });

  /** Registers and logs in a user; returns its id and an access token. */
  const createUser = async (label: string) => {
    const email = uniqueEmail(label);
    const { body } = (await register(email).expect(201)) as {
      body: { id: string };
    };
    const { accessToken } = await login(email);
    return { id: body.id, email, token: accessToken };
  };

  const systemRole = (key: SystemRole) =>
    dataSource
      .getRepository(RoleEntity)
      .findOneByOrFail({ key, organizationId: IsNull() });

  const grantPlatformAdmin = async (userId: string) => {
    const role = await systemRole(SystemRoles.PLATFORM_ADMIN);
    await dataSource
      .getRepository(UserGlobalRoleEntity)
      .insert({ userId, roleId: role.id });
    return role;
  };

  // There is no organizations API yet (Phase 3), so orgs and memberships are
  // set up directly in the database.
  const createOrganization = async () => {
    const slug = `e2e-org-${unique()}`;
    return dataSource
      .getRepository(OrganizationEntity)
      .save({ slug, name: slug });
  };

  const addMember = async (
    organizationId: string,
    userId: string,
    ...roleIds: string[]
  ) => {
    const membership = await dataSource
      .getRepository(OrganizationMembershipEntity)
      .save({ organizationId, userId });
    if (roleIds.length) {
      await dataSource
        .getRepository(OrganizationMembershipRoleEntity)
        .insert(
          roleIds.map((roleId) => ({ membershipId: membership.id, roleId })),
        );
    }
    return membership;
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

  describe('auth', () => {
    it('GET /api is public', () => {
      return http().get('/api').expect(200).expect('Hello World!');
    });

    it('GET /users without a token returns 401', () => {
      return http().get('/api/users').expect(401);
    });

    it('register returns 201, a duplicate email returns 409', async () => {
      const email = uniqueEmail('dup');
      await register(email).expect(201);
      await register(email.toUpperCase()).expect(409);
    });

    it('login with a wrong password returns 401', async () => {
      const email = uniqueEmail('wrong');
      await register(email).expect(201);

      await http()
        .post('/api/auth/login')
        .send({ email, password: 'not-the-password' })
        .expect(401);
    });

    it('login ignores client-supplied roles', async () => {
      const email = uniqueEmail('forge');
      await register(email).expect(201);

      const response = await http()
        .post('/api/auth/login')
        .send({ email, password, globalRoles: [SystemRoles.PLATFORM_ADMIN] })
        .expect(200);
      const { accessToken } = response.body as { accessToken: string };

      await http()
        .get('/api/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });

    it('refresh rotates the session and rejects reuse of the old token', async () => {
      const email = uniqueEmail('rotate');
      await register(email).expect(201);
      const { refreshToken } = await login(email);

      const rotated = await refresh(refreshToken).expect(200);
      expect(rotated.body).toHaveProperty('refreshToken');

      await refresh(refreshToken).expect(401);
    });

    it('logout revokes the session; a later refresh returns 401', async () => {
      const email = uniqueEmail('logout');
      await register(email).expect(201);
      const { refreshToken } = await login(email);

      await http().post('/api/auth/logout').send({ refreshToken }).expect(200);

      await refresh(refreshToken).expect(401);
    });

    it('logout with a garbage token returns 401, not 500', () => {
      return http()
        .post('/api/auth/logout')
        .send({ refreshToken: 'garbage' })
        .expect(401);
    });
  });

  describe('platform permissions', () => {
    it('a regular user can read /users/me but gets 403 on /users and /roles', async () => {
      const user = await createUser('regular');

      const me = await http()
        .get('/api/users/me')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);
      expect(me.body).toEqual({
        id: user.id,
        email: user.email,
        globalRoles: [],
        organizations: [],
      });

      for (const path of ['/api/users', '/api/roles']) {
        await http()
          .get(path)
          .set('Authorization', `Bearer ${user.token}`)
          .expect(403);
      }
    });

    it('a platform_admin can reach GET /users', async () => {
      const admin = await createUser('admin');
      await grantPlatformAdmin(admin.id);

      await http()
        .get('/api/users')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);
    });

    it('revoking a role takes effect on the next request, without a refresh', async () => {
      const user = await createUser('revoke');
      const role = await grantPlatformAdmin(user.id);
      const auth = `Bearer ${user.token}`;

      await http().get('/api/users').set('Authorization', auth).expect(200);
      await dataSource
        .getRepository(UserGlobalRoleEntity)
        .delete({ userId: user.id, roleId: role.id });
      await http().get('/api/users').set('Authorization', auth).expect(403);
    });

    it('a deactivated user loses every permission with a still-valid token', async () => {
      const user = await createUser('inactive');
      await grantPlatformAdmin(user.id);
      await dataSource
        .getRepository(UserEntity)
        .update({ id: user.id }, { isActive: false });

      await http()
        .get('/api/users')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(403);
    });

    it('GET /permissions lists the catalog with each permission’s scopes', async () => {
      const user = await createUser('catalog');

      const response = await http()
        .get('/api/permissions')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);
      expect(response.body).toContainEqual({
        key: Permissions.USERS_READ,
        description: expect.any(String) as string,
        scopes: ['global'],
      });
    });

    it('an admin manages platform roles; system roles are read-only', async () => {
      const admin = await createUser('platform-roles');
      await grantPlatformAdmin(admin.id);
      const auth = `Bearer ${admin.token}`;

      const created = await http()
        .post('/api/roles')
        .set('Authorization', auth)
        .send({
          key: `support_${unique().replace(/\W/g, '_')}`,
          name: 'Support',
          scope: 'global',
          permissions: [Permissions.USERS_READ],
        })
        .expect(201);
      const role = created.body as RoleBody;
      expect(role).toMatchObject({
        organizationId: null,
        permissions: [Permissions.USERS_READ],
      });

      await http()
        .patch(`/api/roles/${role.id}`)
        .set('Authorization', auth)
        .send({
          permissions: [Permissions.USERS_READ, Permissions.USERS_MANAGE],
        })
        .expect(200)
        .expect(({ body }) => {
          expect((body as RoleBody).permissions).toEqual([
            Permissions.USERS_MANAGE,
            Permissions.USERS_READ,
          ]);
        });

      // Assigned roles cannot be deleted until unassigned.
      const support = await createUser('support');
      await http()
        .put(`/api/users/${support.id}/roles`)
        .set('Authorization', auth)
        .send({ roleIds: [role.id] })
        .expect(200);
      await http()
        .get('/api/users')
        .set('Authorization', `Bearer ${support.token}`)
        .expect(200);
      await http()
        .delete(`/api/roles/${role.id}`)
        .set('Authorization', auth)
        .expect(409);
      await http()
        .put(`/api/users/${support.id}/roles`)
        .set('Authorization', auth)
        .send({ roleIds: [] })
        .expect(200, []);
      await http()
        .delete(`/api/roles/${role.id}`)
        .set('Authorization', auth)
        .expect(204);

      const adminRole = await systemRole(SystemRoles.PLATFORM_ADMIN);
      await http()
        .patch(`/api/roles/${adminRole.id}`)
        .set('Authorization', auth)
        .send({ name: 'Renamed' })
        .expect(403);
      await http()
        .delete(`/api/roles/${adminRole.id}`)
        .set('Authorization', auth)
        .expect(403);
    });

    it('rejects an organization-only role scope violation with 400', async () => {
      const admin = await createUser('scope');
      await grantPlatformAdmin(admin.id);

      await http()
        .post('/api/roles')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          key: `bad_${unique().replace(/\W/g, '_')}`,
          name: 'Bad',
          scope: 'organization',
          permissions: [Permissions.USERS_MANAGE],
        })
        .expect(400);
    });
  });

  describe('organization permissions', () => {
    let org: OrganizationEntity;
    let otherOrg: OrganizationEntity;
    let manager: Awaited<ReturnType<typeof createUser>>;
    let tenant: Awaited<ReturnType<typeof createUser>>;
    let otherManager: Awaited<ReturnType<typeof createUser>>;

    const orgPath = (organizationId: string, path = '') =>
      `/api/organizations/${organizationId}${path}`;

    const createOrgRole = (
      token: string,
      organizationId: string,
      permissions: string[],
    ) =>
      http()
        .post(orgPath(organizationId, '/roles'))
        .set('Authorization', `Bearer ${token}`)
        .send({
          key: `custom_${unique().replace(/\W/g, '_')}`,
          name: 'Custom',
          permissions,
        });

    beforeAll(async () => {
      const managerRole = await systemRole(SystemRoles.PROPERTY_MANAGER);
      const tenantRole = await systemRole(SystemRoles.TENANT);
      org = await createOrganization();
      otherOrg = await createOrganization();
      manager = await createUser('manager');
      tenant = await createUser('tenant');
      otherManager = await createUser('other-manager');
      await addMember(org.id, manager.id, managerRole.id);
      await addMember(org.id, tenant.id, tenantRole.id);
      await addMember(otherOrg.id, otherManager.id, managerRole.id);
    });

    it('/users/me shows the caller’s roles per organization', async () => {
      const me = await http()
        .get('/api/users/me')
        .set('Authorization', `Bearer ${tenant.token}`)
        .expect(200);
      expect(me.body).toMatchObject({
        globalRoles: [],
        organizations: [
          {
            organizationId: org.id,
            roles: [{ key: SystemRoles.TENANT }],
          },
        ],
      });
    });

    it('org permissions apply only inside their own org', async () => {
      const inOrg = await http()
        .get(`/api/users/me/permissions?organizationId=${org.id}`)
        .set('Authorization', `Bearer ${manager.token}`)
        .expect(200);
      expect((inOrg.body as { permissions: string[] }).permissions).toContain(
        Permissions.ROLES_MANAGE,
      );

      const platformWide = await http()
        .get('/api/users/me/permissions')
        .set('Authorization', `Bearer ${manager.token}`)
        .expect(200);
      expect(platformWide.body).toEqual({
        organizationId: null,
        permissions: [],
      });

      await http()
        .get(orgPath(org.id, '/roles'))
        .set('Authorization', `Bearer ${manager.token}`)
        .expect(200);
      await http()
        .get(orgPath(org.id, '/roles'))
        .set('Authorization', `Bearer ${otherManager.token}`)
        .expect(403);
      // The header no longer selects the org.
      await http()
        .get('/api/roles')
        .set('Authorization', `Bearer ${manager.token}`)
        .set('x-organization-id', org.id)
        .expect(403);
    });

    it('a manager creates a custom role and assigns it to a member', async () => {
      const created = await createOrgRole(manager.token, org.id, [
        Permissions.PAYMENTS_MANAGE,
      ]).expect(201);
      const role = created.body as RoleBody;
      expect(role.organizationId).toBe(org.id);

      const list = await http()
        .get(orgPath(org.id, '/roles'))
        .set('Authorization', `Bearer ${manager.token}`)
        .expect(200);
      const keys = (list.body as RoleBody[]).map((r) => r.key);
      expect(keys).toEqual(
        expect.arrayContaining([SystemRoles.TENANT, role.key]),
      );
      expect(keys).not.toContain(SystemRoles.PLATFORM_ADMIN);

      const tenantRole = await systemRole(SystemRoles.TENANT);
      await http()
        .put(orgPath(org.id, `/members/${tenant.id}/roles`))
        .set('Authorization', `Bearer ${manager.token}`)
        .send({ roleIds: [tenantRole.id, role.id] })
        .expect(200);

      const permissions = await http()
        .get(`/api/users/me/permissions?organizationId=${org.id}`)
        .set('Authorization', `Bearer ${tenant.token}`)
        .expect(200);
      expect(
        (permissions.body as { permissions: string[] }).permissions,
      ).toContain(Permissions.PAYMENTS_MANAGE);
    });

    it('a member without roles.manage cannot create roles', async () => {
      await createOrgRole(tenant.token, org.id, [
        Permissions.PROPERTIES_READ,
      ]).expect(403);
    });

    it('org roles cannot hold platform-only permissions', async () => {
      await createOrgRole(manager.token, org.id, [
        Permissions.USERS_READ,
      ]).expect(400);
    });

    it('custom roles stay inside their organization', async () => {
      const created = await createOrgRole(manager.token, org.id, [
        Permissions.LEASES_READ,
      ]).expect(201);
      const role = created.body as RoleBody;

      // Invisible from another org, and not assignable there.
      await http()
        .get(orgPath(otherOrg.id, `/roles/${role.id}`))
        .set('Authorization', `Bearer ${otherManager.token}`)
        .expect(404);
      await http()
        .put(orgPath(otherOrg.id, `/members/${otherManager.id}/roles`))
        .set('Authorization', `Bearer ${otherManager.token}`)
        .send({ roleIds: [role.id] })
        .expect(400);
    });

    it('platform templates are read-only through the org routes', async () => {
      const tenantRole = await systemRole(SystemRoles.TENANT);

      await http()
        .get(orgPath(org.id, `/roles/${tenantRole.id}`))
        .set('Authorization', `Bearer ${manager.token}`)
        .expect(200);
      await http()
        .patch(orgPath(org.id, `/roles/${tenantRole.id}`))
        .set('Authorization', `Bearer ${manager.token}`)
        .send({ name: 'Hijacked' })
        .expect(403);
    });

    it('nobody can grant or revoke permissions they do not hold', async () => {
      // A role admin who can manage roles but holds nothing else.
      const roleAdminRole = (
        await createOrgRole(manager.token, org.id, [
          Permissions.ROLES_READ,
          Permissions.ROLES_MANAGE,
        ]).expect(201)
      ).body as RoleBody;
      const roleAdmin = await createUser('role-admin');
      await addMember(org.id, roleAdmin.id, roleAdminRole.id);
      const managerRole = await systemRole(SystemRoles.PROPERTY_MANAGER);

      // Cannot create a role stronger than itself...
      await createOrgRole(roleAdmin.token, org.id, [
        Permissions.PAYMENTS_MANAGE,
      ]).expect(403);
      // ...or hand itself one...
      await http()
        .put(orgPath(org.id, `/members/${roleAdmin.id}/roles`))
        .set('Authorization', `Bearer ${roleAdmin.token}`)
        .send({ roleIds: [roleAdminRole.id, managerRole.id] })
        .expect(403);
      // ...or strip a stronger role from someone else.
      await http()
        .put(orgPath(org.id, `/members/${manager.id}/roles`))
        .set('Authorization', `Bearer ${roleAdmin.token}`)
        .send({ roleIds: [] })
        .expect(403);
      // Roles within its own permissions are fine.
      await createOrgRole(roleAdmin.token, org.id, [
        Permissions.ROLES_READ,
      ]).expect(201);
    });

    it('a platform admin acts in any org without being a member', async () => {
      const admin = await createUser('org-admin');
      await grantPlatformAdmin(admin.id);

      await createOrgRole(admin.token, otherOrg.id, [
        Permissions.PROPERTIES_READ,
      ]).expect(201);
    });

    it('validates the org id and reports unknown orgs and members', async () => {
      const admin = await createUser('validate');
      await grantPlatformAdmin(admin.id);
      const auth = `Bearer ${admin.token}`;

      await http()
        .get(orgPath('constructor', '/roles'))
        .set('Authorization', auth)
        .expect(400);
      await http()
        .get(orgPath('00000000-0000-4000-8000-000000000000', '/roles'))
        .set('Authorization', auth)
        .expect(404);
      await http()
        .get(orgPath(org.id, `/members/${admin.id}/roles`))
        .set('Authorization', auth)
        .expect(404);
    });
  });
});
