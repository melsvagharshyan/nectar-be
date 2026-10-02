export type Role = 'broker' | 'partner' | 'admin';

export interface JwtPayload {
  sub: string;
  role: Role;
  companyId: string | null;
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
  role: Role;
  companyId: string | null;
  companyName: string | null;
}

export interface AuthResponse {
  user: UserDto;
}

export interface IssuedSession extends AuthResponse {
  token: string;
  expiresAt: Date;
}
