import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
  type OperationObject,
  type PathItemObject,
} from '@nestjs/swagger';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const BEARER_SCHEME = 'bearer';
const ERROR_BODY = {
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ErrorResponseDto' },
    },
  },
};

function readVersion(): string {
  const packageJson = readFileSync(
    join(__dirname, '..', '..', 'package.json'),
    'utf8',
  );
  return (JSON.parse(packageJson) as { version: string }).version;
}

/**
 * Builds the OpenAPI document. Every route requires the bearer token unless
 * `@Public()` says otherwise, and the responses every route shares are added
 * here instead of being repeated per endpoint.
 */
export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Rental Management System API')
    .setDescription(
      'Multi-tenant property rental management: organizations, properties, leases and payments.',
    )
    .setVersion(readVersion())
    .addBearerAuth(undefined, BEARER_SCHEME)
    .addSecurityRequirements(BEARER_SCHEME)
    .build();

  const document = SwaggerModule.createDocument(app, config);
  addSharedResponses(document);
  return document;
}

/**
 * - `@Public()` marks a route with `security: [{}]`; OpenAPI wants `[]`.
 * - Protected routes can answer 401.
 * - Routes that read a body, query or path parameter can answer 400.
 */
function addSharedResponses(document: OpenAPIObject): void {
  for (const pathItem of Object.values<PathItemObject>(document.paths)) {
    for (const operation of Object.values(
      pathItem as Record<string, unknown>,
    )) {
      if (!isOperation(operation)) {
        continue;
      }
      const isPublic = operation.security?.some(
        (requirement) => Object.keys(requirement).length === 0,
      );
      if (isPublic) {
        operation.security = [];
      } else {
        operation.responses['401'] ??= {
          description: 'Missing, invalid or expired access token.',
          ...ERROR_BODY,
        };
      }
      if (operation.requestBody || operation.parameters?.length) {
        operation.responses['400'] ??= {
          description: 'Validation failed.',
          ...ERROR_BODY,
        };
      }
    }
  }
}

function isOperation(value: unknown): value is OperationObject {
  return typeof value === 'object' && value !== null && 'responses' in value;
}

/** Serves the UI at `/api/docs` and the JSON at `/api/docs-json`. */
export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup('api/docs', app, createOpenApiDocument(app), {
    jsonDocumentUrl: 'api/docs-json',
    swaggerOptions: { persistAuthorization: true },
  });
}
