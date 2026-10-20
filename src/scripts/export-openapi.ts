import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../app.module';
import { createOpenApiDocument } from '../config/swagger';

/**
 * Writes `openapi.json` at the repo root. Preview mode builds the route graph
 * without instantiating providers, so no database is needed. Run it from the
 * compiled output (`npm run openapi:export`) so the Swagger CLI plugin's
 * metadata is present.
 */
async function exportOpenApi() {
  const app = await NestFactory.create(AppModule, {
    preview: true,
    logger: false,
  });
  const document = createOpenApiDocument(app);
  writeFileSync(
    join(__dirname, '..', '..', 'openapi.json'),
    `${JSON.stringify(document, null, 2)}\n`,
  );
  await app.close();
}
void exportOpenApi();
