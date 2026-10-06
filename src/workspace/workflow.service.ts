import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray, ne, sql, type SQL } from 'drizzle-orm';
import type { AuthUser } from '../auth/auth.types.js';
import {
  DB,
  type Database,
  type Transaction,
} from '../database/database.module.js';
import { nextId } from '../database/ids.js';
import * as t from '../database/schema.js';
import type { MutationResult } from './lists.types.js';
import {
  canSeeRequest,
  isOfferAvailable,
  isOpenStage,
  matchScore,
  OPEN_STAGES,
  SELECTED_OFFER_STATES,
  SUBMITTABLE_STAGES,
} from './rules.js';
import { eventScope } from './scope.js';

type EventType = (typeof t.eventType.enumValues)[number];

interface RequestContext {
  request: typeof t.requests.$inferSelect;
  offers: (typeof t.offers.$inferSelect & { available: boolean })[];
  hasActiveTransfer: boolean;
}

@Injectable()
export class WorkflowService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Broker sends a new or rejected request to the admin for review. */
  submit(user: AuthUser, requestId: string) {
    return this.run(user, async (tx) => {
      const { request } = await this.loadRequest(tx, user, requestId);
      if (!SUBMITTABLE_STAGES.includes(request.stage))
        throw new BadRequestException('Запрос уже на проверке или одобрен');
      await tx
        .update(t.requests)
        .set({ stage: 'pending_review', submittedAt: new Date(), rejectReason: null })
        .where(eq(t.requests.id, request.id));
      await this.addEvent(tx, 'request_submitted', request.id);
    });
  }

  /** Admin approves a request, opening it to partners. */
  approveRequest(user: AuthUser, requestId: string) {
    return this.run(user, async (tx) => {
      const { request } = await this.loadPendingRequest(tx, user, requestId);
      await tx
        .update(t.requests)
        .set({ reviewedBy: user.id, reviewedAt: new Date() })
        .where(eq(t.requests.id, request.id));
      // A re-approved request goes back to `has_offers` if offers are still live.
      await this.recalcStages(tx, eq(t.requests.id, request.id));
      const [started] = await tx
        .select({ id: t.events.id })
        .from(t.events)
        .where(and(eq(t.events.requestId, request.id), eq(t.events.type, 'started')));
      // `started` opens the request to partners once; later approvals follow an edit.
      await this.addEvent(tx, started ? 'request_approved' : 'started', request.id);
    });
  }

  /** Admin rejects a request; the broker edits it and resubmits. */
  rejectRequest(user: AuthUser, requestId: string, reason: string) {
    return this.run(user, async (tx) => {
      const { request } = await this.loadPendingRequest(tx, user, requestId);
      await tx
        .update(t.requests)
        .set({
          stage: 'rejected',
          rejectReason: reason,
          reviewedBy: user.id,
          reviewedAt: new Date(),
        })
        .where(eq(t.requests.id, request.id));
      await this.addEvent(tx, 'request_rejected', request.id);
    });
  }

  /** Broker marks (or unmarks) interest in an offered property. */
  setInterest(user: AuthUser, offerId: string, selected?: boolean) {
    return this.run(user, async (tx) => {
      const { request, offer } = await this.loadSelectableOffer(tx, user, offerId);
      if (offer.disposition === 'rejected')
        throw new BadRequestException('Сначала верните предложение');
      const select = selected ?? offer.state !== 'interested';
      if ((offer.state === 'interested') === select) return;
      await tx
        .update(t.offers)
        .set({ state: select ? 'interested' : 'sent' })
        .where(eq(t.offers.id, offer.id));
      await this.addEvent(tx, 'interest', request.id, offer.propertyId);
    });
  }

  /** Broker rejects an offer, or restores a previously rejected one. */
  setDisposition(
    user: AuthUser,
    offerId: string,
    disposition: 'rejected' | 'neutral',
  ) {
    return this.run(user, async (tx) => {
      const { offer } = await this.loadSelectableOffer(tx, user, offerId);
      await tx
        .update(t.offers)
        .set({ disposition, state: 'sent' })
        .where(eq(t.offers.id, offer.id));
    });
  }

  /** Partner adds or removes one of their properties from a request draft. */
  toggleDraft(user: AuthUser, requestId: string, propertyId: string) {
    return this.run(user, async (tx) => {
      const ctx = await this.loadRequest(tx, user, requestId);
      this.assertEditable(ctx);
      const [property] = await tx
        .select()
        .from(t.properties)
        .where(
          and(
            eq(t.properties.id, propertyId),
            eq(t.properties.companyId, user.companyId!),
          ),
        );
      if (!property)
        throw new BadRequestException('Объект другой компании недоступен');

      const removed = await tx
        .delete(t.drafts)
        .where(
          and(
            eq(t.drafts.requestId, requestId),
            eq(t.drafts.propertyId, propertyId),
          ),
        )
        .returning();
      if (removed.length) return;

      const alreadyOffered = ctx.offers.some((o) => o.propertyId === propertyId);
      if (property.availability !== 'active' || alreadyOffered)
        throw new BadRequestException('Объект недоступен или уже предложен');
      await tx
        .insert(t.drafts)
        .values({ requestId, propertyId, companyId: user.companyId! });
    });
  }

  /** Partner sends the given properties (or their whole draft) for admin review. */
  sendOffers(user: AuthUser, requestId: string, propertyIds?: string[]) {
    return this.run(user, async (tx) => {
      const companyId = user.companyId!;
      const ctx = await this.loadRequest(tx, user, requestId);
      this.assertEditable(ctx);

      const requested =
        propertyIds ??
        (
          await tx
            .select({ propertyId: t.drafts.propertyId })
            .from(t.drafts)
            .where(
              and(
                eq(t.drafts.requestId, requestId),
                eq(t.drafts.companyId, companyId),
              ),
            )
            .orderBy(t.drafts.createdAt)
        ).map((d) => d.propertyId);
      const ids = [...new Set(requested)];

      const valid = ids.length
        ? await tx
            .select()
            .from(t.properties)
            .where(
              and(
                inArray(t.properties.id, ids),
                eq(t.properties.companyId, companyId),
                eq(t.properties.availability, 'active'),
              ),
            )
        : [];
      const offered = new Set(ctx.offers.map((o) => o.propertyId));
      if (
        !ids.length ||
        valid.length !== ids.length ||
        ids.some((id) => offered.has(id))
      )
        throw new BadRequestException(
          'Подборка пуста, содержит недоступные объекты или дубли',
        );

      const byId = new Map(valid.map((p) => [p.id, p]));
      for (const propertyId of ids) {
        await tx.insert(t.offers).values({
          id: await nextId(tx, 'OF', t.offerIdSeq),
          requestId,
          propertyId,
          companyId,
          state: 'sent',
          disposition: 'neutral',
          matchScore: matchScore(ctx.request, byId.get(propertyId)!),
          review: 'pending',
        });
        await this.addEvent(tx, 'offer_submitted', requestId, propertyId);
      }
      await tx
        .delete(t.drafts)
        .where(
          and(
            eq(t.drafts.requestId, requestId),
            inArray(t.drafts.propertyId, ids),
          ),
        );
    });
  }

  /** Admin approves an offer, showing it to the broker. */
  approveOffer(user: AuthUser, offerId: string) {
    return this.run(user, async (tx) => {
      const offer = await this.loadPendingOffer(tx, offerId);
      await tx
        .update(t.offers)
        .set({ review: 'approved', reviewedBy: user.id, reviewedAt: new Date() })
        .where(eq(t.offers.id, offer.id));
      await this.recalcStages(
        tx,
        and(
          eq(t.requests.id, offer.requestId),
          inArray(t.requests.stage, OPEN_STAGES),
        ),
      );
      await this.addEvent(tx, 'offers_sent', offer.requestId, offer.propertyId);
    });
  }

  /** Admin rejects an offer; the partner fixes the property and resubmits. */
  declineOffer(user: AuthUser, offerId: string, reason: string) {
    return this.run(user, async (tx) => {
      const offer = await this.loadPendingOffer(tx, offerId);
      await tx
        .update(t.offers)
        .set({
          review: 'rejected',
          rejectReason: reason,
          reviewedBy: user.id,
          reviewedAt: new Date(),
        })
        .where(eq(t.offers.id, offer.id));
      await this.addEvent(tx, 'offer_rejected', offer.requestId, offer.propertyId);
    });
  }

  /** Partner sends a rejected offer back for review. */
  resubmitOffer(user: AuthUser, offerId: string) {
    return this.run(user, async (tx) => {
      const [found] = await tx
        .select({ offer: t.offers, availability: t.properties.availability })
        .from(t.offers)
        .innerJoin(t.properties, eq(t.properties.id, t.offers.propertyId))
        .where(
          and(
            eq(t.offers.id, offerId),
            eq(t.offers.companyId, user.companyId ?? ''),
          ),
        );
      if (!found) throw new NotFoundException('Предложение не найдено');
      this.assertEditable(await this.loadRequest(tx, user, found.offer.requestId));
      if (found.offer.review !== 'rejected')
        throw new BadRequestException('Предложение не было отклонено');
      if (
        found.availability !== 'active' ||
        ['closed', 'unavailable'].includes(found.offer.state)
      )
        throw new BadRequestException('Объект недоступен для предложения');
      await tx
        .update(t.offers)
        .set({ review: 'pending', rejectReason: null })
        .where(eq(t.offers.id, offerId));
      await this.addEvent(
        tx,
        'offer_submitted',
        found.offer.requestId,
        found.offer.propertyId,
      );
    });
  }

  /**
   * Broker reserves the booked offers for the admin's final review. A property
   * can only be in one active reservation; booked offers whose property is
   * already reserved by another request stay booked but are left out.
   */
  transfer(user: AuthUser, requestId: string) {
    return this.run(user, async (tx) => {
      const ctx = await this.loadRequest(tx, user, requestId);
      this.assertEditable(ctx);
      const booked = ctx.offers.filter(
        (o) =>
          o.available &&
          (SELECTED_OFFER_STATES as readonly string[]).includes(o.state),
      );
      // Row locks serialize brokers reserving the same property concurrently.
      const propertyIds = booked.map((o) => o.propertyId);
      if (propertyIds.length)
        await tx
          .select({ id: t.properties.id })
          .from(t.properties)
          .where(inArray(t.properties.id, propertyIds))
          .orderBy(t.properties.id)
          .for('update');
      // `ctx` was read before the locks: a sale or a partner's edit may have
      // since made an offer unavailable or sent it back to review.
      const fresh = propertyIds.length
        ? await tx
            .select({ offer: t.offers, availability: t.properties.availability })
            .from(t.offers)
            .innerJoin(t.properties, eq(t.properties.id, t.offers.propertyId))
            .where(inArray(t.offers.id, booked.map((o) => o.id)))
            .for('update', { of: t.offers })
        : [];
      const stillBooked = fresh
        .filter(
          ({ offer, availability }) =>
            isOfferAvailable(offer, availability) &&
            (SELECTED_OFFER_STATES as readonly string[]).includes(offer.state),
        )
        .map(({ offer }) => offer);
      const held = propertyIds.length
        ? await tx
            .select({ propertyId: t.offers.propertyId })
            .from(t.offers)
            .where(
              and(
                inArray(t.offers.propertyId, propertyIds),
                eq(t.offers.state, 'transferred'),
                ne(t.offers.requestId, requestId),
              ),
            )
        : [];
      const heldIds = new Set(held.map((h) => h.propertyId));
      const selected = stillBooked.filter((o) => !heldIds.has(o.propertyId));
      if (!selected.length)
        throw new BadRequestException(
          stillBooked.length
            ? 'Выбранные объекты уже зарезервированы по другим запросам'
            : 'Выберите хотя бы одно доступное предложение',
        );
      const offerIds = selected.map((o) => o.id);
      await tx.insert(t.transfers).values({
        id: await nextId(tx, 'TR', t.transferIdSeq),
        requestId,
        offerIds,
        state: 'demo_transferred',
      });
      await tx
        .update(t.offers)
        .set({ state: 'transferred' })
        .where(inArray(t.offers.id, offerIds));
      await tx
        .update(t.requests)
        .set({ stage: 'crm' })
        .where(eq(t.requests.id, requestId));
      await this.addEvent(tx, 'transferred', requestId);
    });
  }

  /** Admin declines the reservation at final review and returns it to work. */
  returnTransfer(user: AuthUser, transferId: string, reason: string) {
    return this.run(user, async (tx) => {
      const transfer = await this.loadActiveTransfer(tx, transferId);
      await tx
        .update(t.transfers)
        .set({ state: 'returned', returnReason: reason })
        .where(eq(t.transfers.id, transfer.id));
      const ctx = await this.loadRequest(tx, user, transfer.requestId);
      for (const offer of ctx.offers.filter((o) =>
        transfer.offerIds.includes(o.id),
      )) {
        await tx
          .update(t.offers)
          .set({ state: offer.available ? 'interested' : 'unavailable' })
          .where(eq(t.offers.id, offer.id));
      }
      await this.recalcStages(tx, eq(t.requests.id, transfer.requestId));
      await this.addEvent(tx, 'returned', transfer.requestId);
    });
  }

  /** Admin closes an active transfer as sold with one of its properties. */
  sell(user: AuthUser, transferId: string, propertyId: string) {
    return this.run(user, async (tx) => {
      const transfer = await this.loadActiveTransfer(tx, transferId);
      const ctx = await this.loadRequest(tx, user, transfer.requestId);
      const chosen = ctx.offers.find(
        (o) => transfer.offerIds.includes(o.id) && o.propertyId === propertyId,
      );
      if (!chosen?.available)
        throw new BadRequestException('Выберите доступный объект из передачи');

      await tx
        .update(t.transfers)
        .set({ state: 'sold', soldPropertyId: propertyId })
        .where(eq(t.transfers.id, transfer.id));
      await tx
        .update(t.requests)
        .set({ stage: 'sold' })
        .where(eq(t.requests.id, transfer.requestId));
      await tx
        .update(t.properties)
        .set({ availability: 'sold' })
        .where(eq(t.properties.id, propertyId));
      await tx
        .update(t.offers)
        .set({
          state: 'closed',
          closeReason: sql`case when ${t.offers.propertyId} = ${propertyId} then 'sold' else 'not_selected' end::offer_close_reason`,
        })
        .where(eq(t.offers.requestId, transfer.requestId));
      await tx
        .update(t.offers)
        .set({ state: 'unavailable' })
        .where(
          and(
            eq(t.offers.propertyId, propertyId),
            ne(t.offers.requestId, transfer.requestId),
            ne(t.offers.state, 'closed'),
          ),
        );
      await this.recalcStages(tx, inArray(t.requests.stage, OPEN_STAGES));
      await tx.delete(t.drafts).where(eq(t.drafts.propertyId, propertyId));
      await this.addEvent(tx, 'sold', transfer.requestId, propertyId);
    });
  }

  async markEventRead(user: AuthUser, eventId: string): Promise<MutationResult> {
    const [event] = await this.db
      .select({ id: t.events.id })
      .from(t.events)
      .where(and(eq(t.events.id, eventId), eventScope(user)));
    if (!event) throw new NotFoundException('Уведомление недоступно');
    await this.db
      .insert(t.eventReads)
      .values({ userId: user.id, eventId })
      .onConflictDoNothing();
    return { ok: true };
  }

  async markAllEventsRead(user: AuthUser): Promise<MutationResult> {
    await this.db
      .insert(t.eventReads)
      .select(
        this.db
          .select({
            userId: sql<string>`${user.id}::uuid`.as('user_id'),
            eventId: t.events.id,
          })
          .from(t.events)
          .where(eventScope(user)),
      )
      .onConflictDoNothing();
    return { ok: true };
  }

  private async run(
    _user: AuthUser,
    action: (tx: Transaction) => Promise<void>,
  ): Promise<MutationResult> {
    await this.db.transaction(action);
    return { ok: true };
  }

  private async loadRequest(
    tx: Transaction,
    user: AuthUser,
    requestId: string,
  ): Promise<RequestContext> {
    const [row] = await tx
      .select({ request: t.requests, clientCompanyId: t.clients.companyId })
      .from(t.requests)
      .innerJoin(t.clients, eq(t.clients.id, t.requests.clientId))
      .where(eq(t.requests.id, requestId))
      .for('update', { of: t.requests });
    if (!row) throw new NotFoundException('Запрос недоступен');

    const offers = await tx
      .select({ offer: t.offers, availability: t.properties.availability })
      .from(t.offers)
      .innerJoin(t.properties, eq(t.properties.id, t.offers.propertyId))
      .where(eq(t.offers.requestId, requestId));
    if (
      !canSeeRequest(
        user,
        row.request,
        row.clientCompanyId,
        offers.map((o) => o.offer),
      )
    )
      throw new NotFoundException('Запрос недоступен');

    const [active] = await tx
      .select({ id: t.transfers.id })
      .from(t.transfers)
      .where(
        and(
          eq(t.transfers.requestId, requestId),
          eq(t.transfers.state, 'demo_transferred'),
        ),
      );
    return {
      request: row.request,
      offers: offers.map(({ offer, availability }) => ({
        ...offer,
        available: isOfferAvailable(offer, availability),
      })),
      hasActiveTransfer: !!active,
    };
  }

  private async loadPendingOffer(tx: Transaction, offerId: string) {
    const [offer] = await tx
      .select()
      .from(t.offers)
      .where(eq(t.offers.id, offerId))
      .for('update');
    if (!offer) throw new NotFoundException('Предложение не найдено');
    if (offer.review !== 'pending')
      throw new BadRequestException('Предложение не ожидает проверки');
    return offer;
  }

  private async loadPendingRequest(
    tx: Transaction,
    user: AuthUser,
    requestId: string,
  ) {
    const ctx = await this.loadRequest(tx, user, requestId);
    if (ctx.request.stage !== 'pending_review')
      throw new BadRequestException('Запрос не ожидает проверки');
    return ctx;
  }

  private async loadSelectableOffer(
    tx: Transaction,
    user: AuthUser,
    offerId: string,
  ) {
    const [found] = await tx
      .select({ requestId: t.offers.requestId })
      .from(t.offers)
      .where(eq(t.offers.id, offerId));
    if (!found) throw new NotFoundException('Предложение не найдено');
    const ctx = await this.loadRequest(tx, user, found.requestId);
    this.assertEditable(ctx);
    const offer = ctx.offers.find((o) => o.id === offerId)!;
    if (!offer.available)
      throw new BadRequestException('Предложение недоступно для выбора');
    return { request: ctx.request, offer };
  }

  private async loadActiveTransfer(tx: Transaction, transferId: string) {
    const [transfer] = await tx
      .select()
      .from(t.transfers)
      .where(eq(t.transfers.id, transferId))
      .for('update');
    if (!transfer || transfer.state !== 'demo_transferred')
      throw new NotFoundException('Активная демопередача не найдена');
    return transfer;
  }

  private assertEditable(ctx: RequestContext) {
    if (!isOpenStage(ctx.request.stage) || ctx.hasActiveTransfer)
      throw new BadRequestException('Запрос завершён или передан в CRM');
  }

  /** A request "has offers" while at least one approved offer is still available. */
  async recalcStages(tx: Transaction, where: SQL | undefined) {
    await tx
      .update(t.requests)
      .set({
        stage: sql`case when exists (
          select 1 from ${t.offers}
          inner join ${t.properties} on ${t.properties.id} = ${t.offers.propertyId}
          where ${t.offers.requestId} = ${t.requests.id}
            and ${t.offers.review} = 'approved'
            and ${t.offers.state} not in ('closed', 'unavailable')
            and ${t.properties.availability} = 'active'
        ) then 'has_offers' else 'in_progress' end::request_stage`,
      })
      .where(where);
  }

  async addEvent(
    tx: Transaction,
    type: EventType,
    requestId: string,
    propertyId?: string,
  ) {
    await tx.insert(t.events).values({
      id: await nextId(tx, 'EV', t.eventIdSeq),
      type,
      requestId,
      propertyId: propertyId ?? null,
    });
  }
}
