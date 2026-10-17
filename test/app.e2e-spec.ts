import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module';
import { RoleEntity } from './../src/modules/shared/entities/role.entity';
import { GlobalRole } from './../src/modules/shared/enums/global-role.enum';
import { UserGlobalRoleEntity } from './../src/modules/users/entities/user-global-role.entity';

/**
 * Requires a migrated and seeded database (`npm run migration:run && npm run seed`).
 * Every run registers fresh users, so it can be repeated against the same DB.
 */
describe('Auth & RBAC (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const password = 'e2e-password-123';
  const uniqueEmail = (label: string) =>
    `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  const register = (email: string) =>
    request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password });

  const login = async (email: string) => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return response.body as { accessToken: string; refreshToken: string };
  };

  const refresh = (refreshToken: string) =>
    request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken });

  const grantPlatformAdmin = async (userId: string) => {
    const role = await dataSource
      .getRepository(RoleEntity)
      .findOneByOrFail({ key: GlobalRole.PLATFORM_ADMIN });
    await dataSource
      .getRepository(UserGlobalRoleEntity)
      .insert({ userId, roleId: role.id });
    return role;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirror the global pipe from main.ts.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidUnknownValues: true,
      }),
    );
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET / is public', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('GET /users without a token returns 401', () => {
    return request(app.getHttpServer()).get('/users').expect(401);
  });

  it('register returns 201, a duplicate email returns 409', async () => {
    const email = uniqueEmail('dup');
    await register(email).expect(201);
    await register(email.toUpperCase()).expect(409);
  });

  it('login with a wrong password returns 401', async () => {
    const email = uniqueEmail('wrong');
    await register(email).expect(201);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'not-the-password' })
      .expect(401);
  });

  it('login ignores client-supplied roles', async () => {
    const email = uniqueEmail('forge');
    await register(email).expect(201);

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password, globalRoles: [GlobalRole.PLATFORM_ADMIN] })
      .expect(200);
    const { accessToken } = response.body as { accessToken: string };

    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('a regular user can read /users/me but gets 403 on /users', async () => {
    const email = uniqueEmail('regular');
    await register(email).expect(201);
    const { accessToken } = await login(email);

    const me = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(me.body).toMatchObject({ email, globalRoles: [] });

    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('a platform_admin can reach GET /users (guard order is fixed)', async () => {
    const email = uniqueEmail('admin');
    const { body } = (await register(email).expect(201)) as {
      body: { id: string };
    };
    await grantPlatformAdmin(body.id);
    const { accessToken } = await login(email);

    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
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

    await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken })
      .expect(200);

    await refresh(refreshToken).expect(401);
  });

  it('logout with a garbage token returns 401, not 500', () => {
    return request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken: 'garbage' })
      .expect(401);
  });

  it('refresh drops a role that was revoked after login', async () => {
    const email = uniqueEmail('revoke');
    const { body } = (await register(email).expect(201)) as {
      body: { id: string };
    };
    const userId = body.id;
    const role = await grantPlatformAdmin(userId);
    const { refreshToken } = await login(email);

    await dataSource
      .getRepository(UserGlobalRoleEntity)
      .delete({ userId, roleId: role.id });

    const refreshed = await refresh(refreshToken).expect(200);
    const { accessToken } = refreshed.body as { accessToken: string };

    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('a prototype-key org header does not break authenticated routes', async () => {
    // No org-scoped routes exist yet; a prototype-key header must not crash
    // routes that only need authentication.
    const email = uniqueEmail('proto');
    await register(email).expect(201);
    const { accessToken } = await login(email);

    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-organization-id', 'constructor')
      .expect(200);
  });
});
