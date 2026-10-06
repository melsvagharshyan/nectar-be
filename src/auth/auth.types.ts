export type Role = 'broker' | 'partner' | 'admin';

/** Roles that can apply through the public sign-up form. */
export type SignUpRole = Exclude<Role, 'admin'>;

/** Which sign-in door issued a session; a token from one never works as the other. */
export type SessionAudience = 'admin' | 'cabinet';

export const audienceFor = (role: Role): SessionAudience =>
  role === 'admin' ? 'admin' : 'cabinet';

/**
 * Role and company are deliberately absent: the guard reads them from the DB
 * on every request, so the token only identifies the account and the session.
 */
export interface JwtPayload {
  sub: string;
  /** Must equal `users.session_version`; bumping that revokes the token. */
  sv: number;
  aud: SessionAudience;
}

export interface AuthUser {
  id: string;
  role: Role;
  companyId: string | null;
}

export interface UserDto {
  id: string;
  email: string;
  name: string;
  phone: string;
  avatarUrl: string | null;
  role: Role;
  companyId: string | null;
  companyName: string | null;
  createdAt: Date;
}

export interface AuthResponse {
  user: UserDto;
}

export interface IssuedSession extends AuthResponse {
  token: string;
  expiresAt: Date;
}

/** Sign-up only files an application; the account is created on approval. */
export interface SignUpResponse {
  status: 'pending';
  email: string;
}
