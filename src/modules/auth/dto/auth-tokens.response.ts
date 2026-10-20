export class AuthTokensResponseDto {
  /** Short-lived JWT; send it as `Authorization: Bearer <token>`. */
  accessToken: string;

  /** Single-use JWT that is exchanged for a new pair at `/auth/refresh`. */
  refreshToken: string;
}
