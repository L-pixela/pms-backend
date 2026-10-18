export interface NewRefreshTokenSession {
  sessionId: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface IRefreshTokenSessionRepository {
  create(session: NewRefreshTokenSession): Promise<void>;

  /**
   * Revokes the session in one atomic statement if it matches, is not revoked
   * and has not expired. Returns whether it did, so two concurrent refreshes
   * with the same token cannot both succeed.
   */
  revokeIfValid(criteria: {
    sessionId: string;
    userId: string;
    tokenHash: string;
  }): Promise<boolean>;

  /** Revokes the session unless it is already revoked. */
  revokeActive(sessionId: string, userId: string): Promise<void>;

  /** Drops the user's sessions that can never be used again. */
  deleteUnusable(userId: string): Promise<void>;
}

export const REFRESH_TOKEN_SESSION_REPOSITORY = Symbol(
  'REFRESH_TOKEN_SESSION_REPOSITORY',
);
