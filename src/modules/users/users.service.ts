import { Injectable } from '@nestjs/common';
import { RoleAssignmentsService } from '../roles/role-assignments.service';
import type { AuthenticatedUser } from '../shared/interfaces/authenticated-user.interface';
import { AccessControlService } from '../shared/services/access-control.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly roleAssignmentsService: RoleAssignmentsService,
    private readonly accessControlService: AccessControlService,
  ) {}

  async getCurrentUser(user: AuthenticatedUser) {
    const roles = await this.roleAssignmentsService.describeUserRoles(user.id);
    return { id: user.id, email: user.email, ...roles };
  }

  /** What the caller may do platform-wide, or inside one organization. */
  async getMyPermissions(user: AuthenticatedUser, organizationId?: string) {
    const permissions = await this.accessControlService.getEffectivePermissions(
      user.id,
      organizationId ?? null,
    );
    return {
      organizationId: organizationId ?? null,
      permissions: [...permissions].sort(),
    };
  }

  listForAdministration() {
    return {
      data: [],
      message: 'Users persistence is not implemented yet.',
    };
  }
}
