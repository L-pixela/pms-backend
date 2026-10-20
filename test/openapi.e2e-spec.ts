import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from './../src/app.module';
import { createOpenApiDocument } from './../src/config/swagger';
import { Permissions } from './../src/modules/shared/constants/permissions';

/**
 * Preview mode builds the route graph without instantiating providers, so
 * this test needs no database. Schemas inferred by the Swagger CLI plugin are
 * not checked: ts-jest does not run the plugin.
 */
describe('OpenAPI document (e2e)', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, {
      preview: true,
      logger: false,
    });
    document = createOpenApiDocument(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const operation = (path: string, method: string) => {
    const item = document.paths[path] as Record<string, any> | undefined;
    return item?.[method] as
      | {
          security?: unknown[];
          responses: Record<string, unknown>;
          'x-required-permissions'?: string[];
        }
      | undefined;
  };

  it('documents every route', () => {
    const expected = [
      '/',
      '/auth/register',
      '/auth/login',
      '/auth/refresh',
      '/auth/logout',
      '/permissions',
      '/roles',
      '/roles/{roleId}',
      '/organizations/{organizationId}/roles',
      '/organizations/{organizationId}/roles/{roleId}',
      '/users/me',
      '/users/me/permissions',
      '/users',
      '/users/{userId}/roles',
      '/organizations/{organizationId}/members/{userId}/roles',
    ];

    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining(expected),
    );
  });

  it('requires the bearer token by default', () => {
    expect(document.security).toEqual([{ bearer: [] }]);
    expect(document.components?.securitySchemes).toHaveProperty('bearer');
    expect(operation('/users/me', 'get')?.security).toBeUndefined();
  });

  it('marks @Public routes with an empty security requirement', () => {
    for (const [path, method] of [
      ['/', 'get'],
      ['/auth/login', 'post'],
      ['/auth/register', 'post'],
    ]) {
      expect(operation(path, method)?.security).toEqual([]);
    }
  });

  it('lists the permissions @RequirePermissions asks for', () => {
    const list = operation('/roles', 'get');
    expect(list?.['x-required-permissions']).toEqual([Permissions.ROLES_READ]);
    expect(list?.responses).toHaveProperty('403');
    expect(operation('/roles', 'post')?.['x-required-permissions']).toContain(
      Permissions.ROLES_MANAGE,
    );
  });

  it('adds the shared 401 and 400 responses only where they apply', () => {
    expect(operation('/roles', 'get')?.responses).toHaveProperty('401');
    expect(operation('/', 'get')?.responses).not.toHaveProperty('401');
    expect(operation('/auth/login', 'post')?.responses).toHaveProperty('400');
    expect(operation('/auth/register', 'post')?.responses).not.toHaveProperty(
      '401',
    );
  });
});
