import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/config/app-setup';
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
    configureApp(app);
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
      '/api',
      '/api/auth/register',
      '/api/auth/login',
      '/api/auth/refresh',
      '/api/auth/logout',
      '/api/permissions',
      '/api/roles',
      '/api/roles/{roleId}',
      '/api/organizations/{organizationId}/roles',
      '/api/organizations/{organizationId}/roles/{roleId}',
      '/api/users/me',
      '/api/users/me/permissions',
      '/api/users',
      '/api/users/{userId}/roles',
      '/api/organizations/{organizationId}/members/{userId}/roles',
    ];

    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining(expected),
    );
  });

  it('requires the bearer token by default', () => {
    expect(document.security).toEqual([{ bearer: [] }]);
    expect(document.components?.securitySchemes).toHaveProperty('bearer');
    expect(operation('/api/users/me', 'get')?.security).toBeUndefined();
  });

  it('marks @Public routes with an empty security requirement', () => {
    for (const [path, method] of [
      ['/api', 'get'],
      ['/api/auth/login', 'post'],
      ['/api/auth/register', 'post'],
    ]) {
      expect(operation(path, method)?.security).toEqual([]);
    }
  });

  it('lists the permissions @RequirePermissions asks for', () => {
    const list = operation('/api/roles', 'get');
    expect(list?.['x-required-permissions']).toEqual([Permissions.ROLES_READ]);
    expect(list?.responses).toHaveProperty('403');
    expect(
      operation('/api/roles', 'post')?.['x-required-permissions'],
    ).toContain(Permissions.ROLES_MANAGE);
  });

  it('adds the shared 401 and 400 responses only where they apply', () => {
    expect(operation('/api/roles', 'get')?.responses).toHaveProperty('401');
    expect(operation('/api', 'get')?.responses).not.toHaveProperty('401');
    expect(operation('/api/auth/login', 'post')?.responses).toHaveProperty(
      '400',
    );
    expect(
      operation('/api/auth/register', 'post')?.responses,
    ).not.toHaveProperty('401');
  });
});
