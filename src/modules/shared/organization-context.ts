import { BadRequestException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { AuthenticatedRequest } from './interfaces/authenticated-request.interface';

/** The route param that marks a route as acting inside one organization. */
export const ORGANIZATION_ID_PARAM = 'organizationId';

/**
 * The org a request acts in, taken only from the `:organizationId` route
 * param, so the org that is authorized is always the org the handler uses.
 * Returns `null` on platform-level routes.
 */
export function resolveOrganizationId(
  request: AuthenticatedRequest,
): string | null {
  const organizationId = (
    request.params as Record<string, string | undefined> | undefined
  )?.[ORGANIZATION_ID_PARAM];

  if (organizationId === undefined) {
    return null;
  }

  if (!isUUID(organizationId)) {
    throw new BadRequestException('organizationId must be a UUID.');
  }

  return organizationId;
}
