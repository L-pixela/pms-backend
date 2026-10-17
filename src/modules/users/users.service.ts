import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../shared/interfaces/authenticated-user.interface';

@Injectable()
export class UsersService {
  getCurrentUser(user: AuthenticatedUser) {
    return {
      id: user.id,
      email: user.email,
      globalRoles: user.globalRoles,
      organizationRoles: user.organizationRoles,
      permissions: user.permissions,
    };
  }

  listForAdministration() {
    return {
      data: [],
      message: 'Users persistence is not implemented yet.',
    };
  }
}
