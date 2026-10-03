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

  /** Broker starts working on a freshly created request. */
  start(user: AuthUser, requestId: string) {
    return this.run(user, async (tx) => {
      const { request } = await this.loadRequest(tx, user, requestId);
      if (request.stage !== 'created')
        throw new BadRequestException('Начать подбор нельзя');
      await tx
        .update(t.requests)
        .set({ stage: 'in_progress' })
        .where(eq(t.requests.id, request.id));
      await this.addEvent(tx, 'started', request.id);
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

  /** Partner sends the given properties (or their whole draft) as offers. */
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
        });
      }
      await tx
        .delete(t.drafts)
        .where(
          and(
            eq(t.drafts.requestId, requestId),
            inArray(t.drafts.propertyId, ids),
          ),
        );
      await tx
        .update(t.requests)
        .set({ stage: 'has_offers' })
        .where(eq(t.requests.id, requestId));
      await this.addEvent(tx, 'offers_sent', requestId);
    });
  }

  /** Broker hands the selected offers over to the CRM. */
  transfer(user: AuthUser, requestId: string) {
    return this.run(user, async (tx) => {
      const ctx = await this.loadRequest(tx, user, requestId);
      this.assertEditable(ctx);
      const selected = ctx.offers.filter(
        (o) =>
          o.available &&
          (SELECTED_OFFER_STATES as readonly string[]).includes(o.state),
      );
      if (!selected.length)
        throw new BadRequestException(
          'Выберите хотя бы одно доступное предложение',
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

  /** Admin returns an active transfer back to work. */
  returnTransfer(user: AuthUser, transferId: string) {
    return this.run(user, async (tx) => {
      const transfer = await this.loadActiveTransfer(tx, transferId);
      await tx
        .update(t.transfers)
        .set({ state: 'returned' })
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

  /** A request "has offers" while at least one offer is still available. */
  async recalcStages(tx: Transaction, where: SQL | undefined) {
    await tx
      .update(t.requests)
      .set({
        stage: sql`case when exists (
          select 1 from ${t.offers}
          inner join ${t.properties} on ${t.properties.id} = ${t.offers.propertyId}
          where ${t.offers.requestId} = ${t.requests.id}
            and ${t.offers.state} not in ('closed', 'unavailable')
            and ${t.properties.availability} = 'active'
        ) then 'has_offers' else 'in_progress' end::request_stage`,
      })
      .where(where);
  }

  private async addEvent(
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
