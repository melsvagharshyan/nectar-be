import type { Role } from '../auth/auth.types.js';

/** A sign-in account as admins see it in the company panel. */
export interface AccountView {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
  blockedAt: string | null;
  blockReason: string | null;
  blockedByName: string | null;
}
