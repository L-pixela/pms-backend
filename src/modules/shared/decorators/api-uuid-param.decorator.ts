import { ApiParam } from '@nestjs/swagger';

/** Documents a path parameter as a UUID. */
export const ApiUuidParam = (name: string, description?: string) =>
  ApiParam({ name, type: String, format: 'uuid', description });
