import type { AuthUser } from '../auth/auth.types.js';
import type * as t from '../database/schema.js';
import type {
  ClientView,
  CompanyView,
  EventView,
  OfferView,
  PropertyView,
  RequestView,
  TransferView,
} from './workspace.types.js';

type Row<T extends { $inferSelect: unknown }> = T['$inferSelect'];

const iso = (date: Date) => date.toISOString();

export const toCompanyView = ({
  id,
  kind,
  name,
  contact,
}: Row<typeof t.companies>): CompanyView => ({ id, kind, name, contact });

export function toClientView(
  user: AuthUser,
  { createdAt: _createdAt, ...c }: Row<typeof t.clients>,
): ClientView {
  if (user.role !== 'partner') return c;
  return { ...c, name: `Клиент ${c.publicId}`, phone: '', email: '' };
}

export const toRequestView = ({
  reviewedBy: _reviewedBy,
  ...r
}: Row<typeof t.requests>): RequestView => ({
  ...r,
  submittedAt: r.submittedAt && iso(r.submittedAt),
  reviewedAt: r.reviewedAt && iso(r.reviewedAt),
  createdAt: iso(r.createdAt),
});

export function toPropertyView(
  user: AuthUser,
  { createdAt: _createdAt, ...p }: Row<typeof t.properties>,
): PropertyView {
  if (user.role !== 'broker') return p;
  return { ...p, privateNotes: '', internalAddress: '' };
}

export const toOfferView = ({
  closeReason,
  reviewedBy: _reviewedBy,
  ...o
}: Row<typeof t.offers>): OfferView => ({
  ...o,
  ...(closeReason ? { closeReason } : {}),
  reviewedAt: o.reviewedAt && iso(o.reviewedAt),
  createdAt: iso(o.createdAt),
});

export const toTransferView = ({
  soldPropertyId,
  ...tr
}: Row<typeof t.transfers>): TransferView => ({
  ...tr,
  ...(soldPropertyId ? { soldPropertyId } : {}),
  createdAt: iso(tr.createdAt),
});

export const toEventView = ({
  propertyId,
  ...e
}: Row<typeof t.events>): EventView => ({
  ...e,
  ...(propertyId ? { propertyId } : {}),
  createdAt: iso(e.createdAt),
});
