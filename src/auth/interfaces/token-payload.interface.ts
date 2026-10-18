/**
 * Identity only. Permissions are not embedded: they are resolved from the
 * database on every request, so a role change applies immediately.
 */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  tokenType: 'access';
}

/** Identifies the refresh session; carries no privileges. */
export interface RefreshTokenPayload {
  sub: string;
  tokenType: 'refresh';
  sessionId: string;
}
