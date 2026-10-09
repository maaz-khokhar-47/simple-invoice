export interface JwtPayload {
  sub: string;
  email: string;
}

/** What ends up on request.user after the JWT strategy runs. */
export interface AuthUser {
  id: string;
  email: string;
}
