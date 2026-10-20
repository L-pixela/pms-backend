import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiSecurity } from '@nestjs/swagger';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Skips authentication. In the OpenAPI document the route carries an empty
 * security requirement, which overrides the global bearer one.
 */
export const Public = () =>
  applyDecorators(SetMetadata(IS_PUBLIC_KEY, true), ApiSecurity({}));
