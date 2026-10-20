import { ValidationPipe, type INestApplication } from '@nestjs/common';

/** Every route is served under `/api` (e.g. `/api/auth/login`). */
export const API_PREFIX = 'api';

/**
 * Global app configuration shared by `main.ts`, the e2e tests and the OpenAPI
 * export, so they all see the same routes and validation.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: true,
    }),
  );
}
