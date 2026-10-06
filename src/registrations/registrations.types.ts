import type { SignUpRole } from '../auth/auth.types.js';
import type { CursorPage } from '../workspace/pagination.js';

export type RegistrationStatus = 'pending' | 'approved' | 'rejected';

/** An application as admins see it; the password hash is never exposed. */
export interface RegistrationView {
  id: string;
  role: SignUpRole;
  status: RegistrationStatus;
  email: string;
  name: string;
  phone: string;
  companyName: string;
  rejectReason: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  userId: string | null;
  companyId: string | null;
  /** For approved requests: the current state of the created account. */
  userBlockedAt: string | null;
  userBlockReason: string | null;
  createdAt: string;
}

/** `counts` honour the role and search filters, but not `status`. */
export type RegistrationsPage = CursorPage<RegistrationView> & {
  counts: Record<RegistrationStatus, number>;
};

export interface ApproveResult {
  ok: true;
  userId: string;
  companyId: string;
}
