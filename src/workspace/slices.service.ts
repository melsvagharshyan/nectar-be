import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { AuthUser } from '../auth/auth.types.js';
import { DB, type Database } from '../database/database.module.js';
import * as t from '../database/schema.js';
import {
  toClientView,
  toEventView,
  toOfferView,
  toPropertyView,
  toRequestView,
  toTransferView,
} from './mappers.js';
import { eventScope, offerScope, requestScope } from './scope.js';
import type { Slice } from './lists.types.js';
import type { OfferView } from './workspace.types.js';

export const emptySlice = (): Slice => ({
  clients: [],
  requests: [],
  properties: [],
  offers: [],
  transfers: [],
  drafts: {},
  events: [],
});

const unique = (values: string[]) => [...new Set(values)];

/**
 * Loads the records that sit around a page of requests or properties (their
 * clients, offers, offered properties, transfers, drafts), already limited to
 * what the caller may see, so the UI can render a page without the full database.
 */
@Injectable()
export class SlicesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async forRequests(
    user: AuthUser,
    requestIds: string[],
    { events = false }: { events?: boolean } = {},
  ): Promise<Slice> {
    const ids = unique(requestIds);
    if (!ids.length) return emptySlice();

    const requests = await this.db
      .select()
      .from(t.requests)
      .where(and(inArray(t.requests.id, ids), requestScope(user)));
    const visibleIds = requests.map((r) => r.id);
    if (!visibleIds.length) return emptySlice();

    const [clients, offers, transfers, drafts, eventRows] = await Promise.all([
      this.db
        .select()
        .from(t.clients)
        .where(inArray(t.clients.id, unique(requests.map((r) => r.clientId)))),
      this.db
        .select()
        .from(t.offers)
        .where(and(inArray(t.offers.requestId, visibleIds), offerScope(user))),
      this.db
        .select()
        .from(t.transfers)
        .where(inArray(t.transfers.requestId, visibleIds)),
      user.role === 'broker'
        ? Promise.resolve([])
        : this.db
            .select()
            .from(t.drafts)
            .where(
              and(
                inArray(t.drafts.requestId, visibleIds),
                user.role === 'partner'
                  ? eq(t.drafts.companyId, user.companyId ?? '')
                  : undefined,
              ),
            ),
      events
        ? this.db
            .select()
            .from(t.events)
            .where(and(inArray(t.events.requestId, visibleIds), eventScope(user)))
            .orderBy(desc(t.events.createdAt), desc(t.events.id))
        : Promise.resolve([]),
    ]);

    const propertyIds = unique([
      ...offers.map((o) => o.propertyId),
      ...drafts.map((d) => d.propertyId),
    ]);
    const properties = propertyIds.length
      ? await this.db
          .select()
          .from(t.properties)
          .where(inArray(t.properties.id, propertyIds))
      : [];

    const draftMap: Record<string, string[]> = {};
    for (const d of drafts) (draftMap[d.requestId] ??= []).push(d.propertyId);

    return {
      clients: clients.map((c) => toClientView(user, c)),
      requests: requests.map(toRequestView),
      properties: properties.map((p) => toPropertyView(user, p)),
      offers: await this.withReservations(
        offers.map((o) => toOfferView(user, o)),
      ),
      transfers: this.scopeTransfers(user, transfers, offers, properties),
      drafts: draftMap,
      events: eventRows.map(toEventView),
    };
  }

  /** Offers on the given properties that the caller may see. */
  async offersForProperties(user: AuthUser, propertyIds: string[]) {
    const ids = unique(propertyIds);
    if (!ids.length) return [];
    const rows = await this.db
      .select()
      .from(t.offers)
      .where(and(inArray(t.offers.propertyId, ids), offerScope(user)));
    return rows.map((o) => toOfferView(user, o));
  }

  /**
   * Flags offers whose property is held by another request's active
   * reservation, so the broker can't reserve it too. Only exposes a boolean.
   */
  async withReservations(offers: OfferView[]): Promise<OfferView[]> {
    const propertyIds = unique(offers.map((o) => o.propertyId));
    if (!propertyIds.length) return offers;
    const held = await this.db
      .select({ requestId: t.offers.requestId, propertyId: t.offers.propertyId })
      .from(t.offers)
      .where(
        and(
          inArray(t.offers.propertyId, propertyIds),
          eq(t.offers.state, 'transferred'),
        ),
      );
    return offers.map((o) => ({
      ...o,
      reservedElsewhere: held.some(
        (h) => h.propertyId === o.propertyId && h.requestId !== o.requestId,
      ),
    }));
  }

  private scopeTransfers(
    user: AuthUser,
    transfers: (typeof t.transfers.$inferSelect)[],
    offers: (typeof t.offers.$inferSelect)[],
    properties: (typeof t.properties.$inferSelect)[],
  ) {
    if (user.role !== 'partner') return transfers.map(toTransferView);
    const ownOffers = new Set(
      offers.filter((o) => o.companyId === user.companyId).map((o) => o.id),
    );
    const ownProperties = new Set(
      properties.filter((p) => p.companyId === user.companyId).map((p) => p.id),
    );
    return transfers
      .filter((tr) => tr.offerIds.some((id) => ownOffers.has(id)))
      .map((tr) =>
        toTransferView({
          ...tr,
          offerIds: tr.offerIds.filter((id) => ownOffers.has(id)),
          soldPropertyId:
            tr.soldPropertyId && ownProperties.has(tr.soldPropertyId)
              ? tr.soldPropertyId
              : null,
          returnReason: null,
        }),
      );
  }
}
