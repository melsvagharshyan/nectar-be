import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { AuthUser } from '../auth/auth.types.js';
import { DB, type Database } from '../database/database.module.js';
import * as t from '../database/schema.js';
import { canSeeRequest, isEventVisible } from './rules.js';
import type {
  ClientView,
  EventView,
  OfferView,
  PropertyView,
  RequestView,
  TransferView,
  WorkspaceState,
} from './workspace.types.js';

const iso = (date: Date) => date.toISOString();

function withoutCreatedAt<T extends { createdAt: Date }>(
  row: T,
): Omit<T, 'createdAt'> {
  const copy: Partial<T> = { ...row };
  delete copy.createdAt;
  return copy as Omit<T, 'createdAt'>;
}

@Injectable()
export class ReferenceSnapshot {
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Returns the workspace in the shape the UI expects, limited to what the
   * caller's role may see: brokers only get their own clients and never see
   * partners' private property notes; partners never see client contacts.
   */
  async snapshot(user: AuthUser): Promise<WorkspaceState> {
    const full = await this.loadAll(user);
    if (user.role === 'admin') return full;

    const clientCompany = new Map(full.clients.map((c) => [c.id, c.companyId]));
    const requests = full.requests.filter((r) =>
      canSeeRequest(user, r, clientCompany.get(r.clientId), full.offers),
    );
    const requestIds = new Set(requests.map((r) => r.id));
    const requestById = new Map(requests.map((r) => [r.id, r]));
    const events = full.events.filter((e) => {
      const request = requestById.get(e.requestId);
      return !!request && isEventVisible(user, e, request, full);
    });
    const employees = full.employees.filter(
      (e) => e.companyId === user.companyId,
    );

    if (user.role === 'broker') {
      const offers = full.offers.filter((o) => requestIds.has(o.requestId));
      const offered = new Set(offers.map((o) => o.propertyId));
      return {
        ...full,
        employees,
        clients: full.clients.filter((c) => c.companyId === user.companyId),
        requests,
        offers,
        properties: full.properties
          .filter((p) => p.availability === 'active' || offered.has(p.id))
          .map((p) => ({ ...p, privateNotes: '', internalAddress: '' })),
        transfers: full.transfers.filter((tr) => requestIds.has(tr.requestId)),
        drafts: {},
        events,
      };
    }

    const offers = full.offers.filter((o) => o.companyId === user.companyId);
    const offerIds = new Set(offers.map((o) => o.id));
    const properties = full.properties.filter(
      (p) => p.companyId === user.companyId,
    );
    const ownPropertyIds = new Set(properties.map((p) => p.id));
    const visibleClientIds = new Set(requests.map((r) => r.clientId));
    return {
      ...full,
      employees,
      clients: full.clients
        .filter((c) => visibleClientIds.has(c.id))
        .map((c) => ({
          ...c,
          name: `Клиент ${c.publicId}`,
          phone: '',
          email: '',
        })),
      requests,
      offers,
      properties,
      transfers: full.transfers
        .filter((tr) => tr.offerIds.some((id) => offerIds.has(id)))
        .map((tr) => ({
          ...tr,
          offerIds: tr.offerIds.filter((id) => offerIds.has(id)),
          soldPropertyId:
            tr.soldPropertyId && ownPropertyIds.has(tr.soldPropertyId)
              ? tr.soldPropertyId
              : undefined,
        })),
      drafts: Object.fromEntries(
        Object.entries(full.drafts).filter(([id]) => requestIds.has(id)),
      ),
      events,
    };
  }

  private async loadAll(user: AuthUser): Promise<WorkspaceState> {
    const [
      companies,
      employees,
      clients,
      requests,
      properties,
      offers,
      transfers,
      events,
      drafts,
      reads,
    ] = await Promise.all([
      this.db.select().from(t.companies).orderBy(asc(t.companies.id)),
      this.db.select().from(t.employees).orderBy(asc(t.employees.id)),
      this.db.select().from(t.clients).orderBy(asc(t.clients.id)),
      this.db.select().from(t.requests).orderBy(asc(t.requests.id)),
      this.db.select().from(t.properties).orderBy(asc(t.properties.id)),
      this.db.select().from(t.offers).orderBy(asc(t.offers.id)),
      this.db.select().from(t.transfers).orderBy(asc(t.transfers.id)),
      this.db.select().from(t.events).orderBy(asc(t.events.createdAt)),
      this.db.select().from(t.drafts).orderBy(asc(t.drafts.createdAt)),
      this.db
        .select({ eventId: t.eventReads.eventId })
        .from(t.eventReads)
        .where(eq(t.eventReads.userId, user.id)),
    ]);

    const draftMap: Record<string, string[]> = {};
    for (const d of drafts) {
      if (user.role === 'partner' && d.companyId !== user.companyId) continue;
      (draftMap[d.requestId] ??= []).push(d.propertyId);
    }

    return {
      companies: companies.map(withoutCreatedAt),
      employees,
      clients: clients.map((c): ClientView => withoutCreatedAt(c)),
      requests: requests.map(
        (r): RequestView => ({ ...r, createdAt: iso(r.createdAt) }),
      ),
      properties: properties.map((p): PropertyView => withoutCreatedAt(p)),
      offers: offers.map(
        ({ closeReason, ...o }): OfferView => ({
          ...o,
          ...(closeReason ? { closeReason } : {}),
          createdAt: iso(o.createdAt),
        }),
      ),
      transfers: transfers.map(
        ({ soldPropertyId, ...tr }): TransferView => ({
          ...tr,
          ...(soldPropertyId ? { soldPropertyId } : {}),
          createdAt: iso(tr.createdAt),
        }),
      ),
      events: events.map(
        ({ propertyId, ...e }): EventView => ({
          ...e,
          ...(propertyId ? { propertyId } : {}),
          createdAt: iso(e.createdAt),
        }),
      ),
      drafts: draftMap,
      readEventIds: reads.map((r) => `${user.role}:${r.eventId}`),
    };
  }
}
