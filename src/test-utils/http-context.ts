import type { ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '../modules/shared/interfaces/authenticated-user.interface';

interface HttpContextOptions {
  user?: AuthenticatedUser;
  headers?: Record<string, string | string[]>;
  params?: Record<string, string>;
}

/** Minimal HTTP ExecutionContext for guard unit tests. */
export function createHttpContext({
  user,
  headers = {},
  params = {},
}: HttpContextOptions = {}): ExecutionContext {
  const request = { user, headers, params };
  const handler = () => undefined;
  class TestController {}

  return {
    getHandler: () => handler,
    getClass: () => TestController,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
    getType: () => 'http',
  } as unknown as ExecutionContext;
}

export function buildUser(
  overrides: Partial<AuthenticatedUser> = {},
): AuthenticatedUser {
  return {
    id: 'user-1',
    email: 'user@example.com',
    globalRoles: [],
    organizationRoles: {},
    permissions: [],
    ...overrides,
  };
}
