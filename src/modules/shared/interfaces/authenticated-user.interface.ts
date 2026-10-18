/**
 * The caller, from the access token. It carries identity only: permissions
 * are loaded from the database per request (`AccessControlService`).
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
}
