import { existsSync } from 'node:fs';
import { and, eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AuthUser } from '../auth/auth.types.js';
import { createDatabase, type Database } from '../database/database.module.js';
import * as t from '../database/schema.js';
import { InsightsService } from './insights.service.js';
import { ListsService } from './lists.service.js';
import type { PropertyDto, RequestDto } from './records.dto.js';
import { RecordsService } from './records.service.js';
import { SlicesService } from './slices.service.js';
import { ReferenceSnapshot } from './snapshot.reference.js';
import { WorkflowService } from './workflow.service.js';

if (existsSync('.env')) process.loadEnvFile('.env');

/**
 * The deal flow end to end: admin review of requests and offers, reservations
 * and review notifications. Runs in its own throwaway database (created from
 * DATABASE_URL's server and dropped afterwards), so it never touches dev data.
 */

const REQUEST: RequestDto = {
  type: 'Квартира',
  districts: ['Кентрон'],
  budgetMin: 0,
  budgetMax: 200000,
  areaMin: 0,
  areaMax: 0,
  rooms: 2,
  goal: '',
  term: '',
  notes: '',
  market: '',
  repair: '',
  furniture: '',
  parking: '',
  view: '',
  amenities: [],
};

const PROPERTY: PropertyDto = {
  publish: true,
  type: 'Квартира',
  district: 'Кентрон',
  price: 150000,
  area: 60,
  rooms: 2,
  floor: null,
  floors: null,
  ceiling: null,
  market: '',
  location: '',
  internalAddress: 'ул. Абовяна, 1',
  description: 'Светлая квартира',
  privateNotes: '',
  repair: '',
  furniture: '',
  parking: '',
  bathroom: '',
  balcony: '',
  building: '',
  amenities: [],
  media: ['https://res.cloudinary.com/demo/image/upload/a.jpg'],
};

const PAGE = { page: 1, limit: 50 };

describe.skipIf(!process.env.DATABASE_URL)('WorkflowService deal flow', () => {
  const dbName = `nectar_workflow_test_${process.pid}_${Date.now()}`;
  const serverUrl = new URL(process.env.DATABASE_URL ?? 'postgres://localhost');
  serverUrl.pathname = '/postgres';
  const testUrl = new URL(serverUrl);
  testUrl.pathname = `/${dbName}`;

  let pool: pg.Pool;
  let db: Database;
  let wf: WorkflowService;
  let records: RecordsService;
  let lists: ListsService;
  let insights: InsightsService;
  let reference: ReferenceSnapshot;

  let broker: AuthUser;
  let partner: AuthUser;
  let otherPartner: AuthUser;
  let admin: AuthUser;
  let clientId: string;
  let propertyId: string;

  const admin_ = async (query: string) => {
    const client = new pg.Client({ connectionString: serverUrl.toString() });
    await client.connect();
    try {
      await client.query(query);
    } finally {
      await client.end();
    }
  };

  beforeAll(async () => {
    await admin_(`create database "${dbName}"`);
    pool = new pg.Pool({ connectionString: testUrl.toString() });
    db = createDatabase(pool);
    await migrate(db, { migrationsFolder: 'drizzle' });
    const slices = new SlicesService(db);
    wf = new WorkflowService(db);
    records = new RecordsService(db, wf);
    lists = new ListsService(db, slices);
    insights = new InsightsService(db, slices);
    reference = new ReferenceSnapshot(db);
  });

  afterAll(async () => {
    await pool?.end();
    await admin_(`drop database if exists "${dbName}" with (force)`);
  });

  const user = async (
    email: string,
    role: AuthUser['role'],
    companyId: string | null,
  ): Promise<AuthUser> => {
    const [u] = await db
      .insert(t.users)
      .values({ email, passwordHash: 'x', role, name: role, companyId })
      .returning();
    return { id: u.id, role, companyId };
  };

  beforeEach(async () => {
    await db.execute(
      sql`truncate ${t.companies}, ${t.users}, ${t.registrationRequests} cascade`,
    );
    await db.insert(t.companies).values([
      { id: 'RF-1', kind: 'rf', name: 'RF' },
      { id: 'AM-2', kind: 'am', name: 'AM' },
      { id: 'AM-3', kind: 'am', name: 'AM other' },
    ]);
    await db.insert(t.employees).values([
      { id: 'RF-1-E01', companyId: 'RF-1', name: 'Broker' },
      { id: 'AM-2-E01', companyId: 'AM-2', name: 'Partner' },
    ]);
    broker = await user('broker@test', 'broker', 'RF-1');
    partner = await user('partner@test', 'partner', 'AM-2');
    otherPartner = await user('partner3@test', 'partner', 'AM-3');
    admin = await user('admin@test', 'admin', null);

    await records.createClient(broker, {
      name: 'Иван',
      phone: '+7',
      email: '',
      employeeId: 'RF-1-E01',
    });
    [{ id: clientId }] = await db.select({ id: t.clients.id }).from(t.clients);
    propertyId = await newProperty();
  });

  const newRequest = async () => {
    const before = new Set((await db.select().from(t.requests)).map((r) => r.id));
    await records.createRequest(broker, clientId, REQUEST);
    return (await db.select().from(t.requests)).find((r) => !before.has(r.id))!.id;
  };

  const newProperty = async () => {
    const before = new Set((await db.select().from(t.properties)).map((p) => p.id));
    await records.createProperty(partner, PROPERTY);
    return (await db.select().from(t.properties)).find((p) => !before.has(p.id))!.id;
  };

  const approvedRequest = async () => {
    const id = await newRequest();
    await wf.submit(broker, id);
    await wf.approveRequest(admin, id);
    return id;
  };

  const stageOf = async (id: string) =>
    (await db.select().from(t.requests).where(eq(t.requests.id, id)))[0].stage;

  const offerOf = async (requestId: string, property = propertyId) =>
    (
      await db
        .select()
        .from(t.offers)
        .where(and(eq(t.offers.requestId, requestId), eq(t.offers.propertyId, property)))
    )[0];

  const approvedOffer = async (requestId: string, property = propertyId) => {
    await wf.sendOffers(partner, requestId, [property]);
    const offer = await offerOf(requestId, property);
    await wf.approveOffer(admin, offer.id);
    return offer.id;
  };

  const visibleRequests = async (u: AuthUser) =>
    (await lists.requests(u, { limit: 50 })).items.map((r) => r.id);

  const eventTypes = async (u: AuthUser) =>
    (await lists.notifications(u, { limit: 100 })).items.map((e) => e.type).reverse();

  /** The SQL scopes and the TS rules in rules.ts must agree for every role. */
  const expectScopesMatchRules = async () => {
    for (const u of [broker, partner, otherPartner, admin]) {
      const snapshot = await reference.snapshot(u);
      const ids = (items: { id: string }[]) => items.map((i) => i.id).sort();
      expect(ids((await lists.requests(u, { limit: 50 })).items)).toEqual(
        ids(snapshot.requests),
      );
      expect(ids((await lists.notifications(u, { limit: 100 })).items)).toEqual(
        ids(snapshot.events),
      );
      if (u.role === 'broker')
        expect(ids((await lists.propertiesFeed(u, PAGE)).items)).toEqual(
          ids(snapshot.properties.filter((p) => p.availability === 'active')),
        );
    }
  };

  describe('request review', () => {
    it('hides a request from partners until an admin approves it', async () => {
      const id = await newRequest();
      expect(await stageOf(id)).toBe('created');
      await expect(wf.approveRequest(admin, id)).rejects.toThrow();

      await wf.submit(broker, id);
      expect(await stageOf(id)).toBe('pending_review');
      expect(await visibleRequests(partner)).not.toContain(id);
      expect((await insights.bootstrap(admin)).pendingRequests).toBe(1);
      expect((await lists.requestsTable(admin, { ...PAGE, view: 'review' })).total).toBe(1);
      await expect(wf.submit(broker, id)).rejects.toThrow();
      await expect(wf.sendOffers(partner, id, [propertyId])).rejects.toThrow();
      await expectScopesMatchRules();

      await wf.approveRequest(admin, id);
      expect(await stageOf(id)).toBe('in_progress');
      expect(await visibleRequests(partner)).toContain(id);
      await expect(wf.approveRequest(admin, id)).rejects.toThrow();
      await expect(wf.submit(broker, id)).rejects.toThrow();
    });

    it('lets the broker fix and resubmit a rejected request', async () => {
      const id = await newRequest();
      await wf.submit(broker, id);
      await wf.rejectRequest(admin, id, 'Уточните бюджет');

      const [row] = await db.select().from(t.requests).where(eq(t.requests.id, id));
      expect(row.stage).toBe('rejected');
      expect(row.reviewedBy).toBe(admin.id);
      const view = (await lists.requestDetail(broker, id)).requests[0];
      expect(view.rejectReason).toBe('Уточните бюджет');
      expect(view).not.toHaveProperty('reviewedBy');
      expect(await visibleRequests(partner)).not.toContain(id);

      await records.updateRequest(broker, id, { ...REQUEST, budgetMax: 250000 });
      expect(await stageOf(id)).toBe('rejected');
      await wf.submit(broker, id);
      expect(await stageOf(id)).toBe('pending_review');
      expect((await lists.requestDetail(broker, id)).requests[0].rejectReason).toBeNull();
    });

    it('sends an approved request back to review when the broker edits it', async () => {
      const id = await approvedRequest();
      const offerId = await approvedOffer(id);
      expect(await stageOf(id)).toBe('has_offers');
      expect((await offerOf(id)).matchScore).toBe(100);

      await records.updateRequest(broker, id, { ...REQUEST, rooms: 3 });
      expect(await stageOf(id)).toBe('pending_review');
      expect(await visibleRequests(partner)).not.toContain(id);
      expect((await offerOf(id)).matchScore).toBe(85);
      await expect(wf.setInterest(broker, offerId)).rejects.toThrow();
      await expectScopesMatchRules();

      await wf.approveRequest(admin, id);
      expect(await stageOf(id)).toBe('has_offers');
    });

    it('does not re-review a broker save that changes nothing', async () => {
      const id = await approvedRequest();
      const before = await eventTypes(broker);
      await records.updateRequest(broker, id, REQUEST);
      expect(await stageOf(id)).toBe('in_progress');
      expect(await visibleRequests(partner)).toContain(id);
      expect(await eventTypes(broker)).toEqual(before);
    });

    it('does not re-review an admin edit', async () => {
      const id = await approvedRequest();
      await records.updateRequest(admin, id, { ...REQUEST, rooms: 3 });
      expect(await stageOf(id)).toBe('in_progress');
    });
  });

  describe('offer review', () => {
    it('hides an offer from the broker until an admin approves it', async () => {
      const id = await approvedRequest();
      await wf.sendOffers(partner, id, [propertyId]);
      const offer = await offerOf(id);
      expect(offer.review).toBe('pending');
      expect(await stageOf(id)).toBe('in_progress');
      expect((await lists.requestDetail(broker, id)).offers).toEqual([]);
      expect((await lists.propertiesFeed(broker, PAGE)).items).toEqual([]);
      await expect(lists.propertyDetail(broker, propertyId)).rejects.toThrow();
      await expect(wf.setInterest(broker, offer.id)).rejects.toThrow();
      await expect(wf.transfer(broker, id)).rejects.toThrow();
      expect((await insights.bootstrap(admin)).pendingOffers).toBe(1);
      expect((await lists.offersTable(admin, { ...PAGE, review: 'pending' })).total).toBe(1);
      await expectScopesMatchRules();

      await wf.approveOffer(admin, offer.id);
      expect(await stageOf(id)).toBe('has_offers');
      expect((await lists.requestDetail(broker, id)).offers).toHaveLength(1);
      expect((await lists.propertiesFeed(broker, PAGE)).items.map((p) => p.id)).toEqual([
        propertyId,
      ]);
      const property = (await lists.propertyDetail(broker, propertyId)).properties[0];
      expect(property.internalAddress).toBe('');
      await expect(wf.approveOffer(admin, offer.id)).rejects.toThrow();
      await expectScopesMatchRules();
    });

    it('lets the partner resubmit a rejected offer', async () => {
      const id = await approvedRequest();
      await wf.sendOffers(partner, id, [propertyId]);
      const { id: offerId } = await offerOf(id);
      await expect(wf.resubmitOffer(partner, offerId)).rejects.toThrow();

      await wf.declineOffer(admin, offerId, 'Нет фото кухни');
      const own = (await lists.offersTable(partner, { ...PAGE, review: 'rejected' })).items;
      expect(own[0].rejectReason).toBe('Нет фото кухни');
      expect(own[0]).not.toHaveProperty('reviewedBy');
      expect((await lists.requestDetail(broker, id)).offers).toEqual([]);
      await expect(wf.approveOffer(admin, offerId)).rejects.toThrow();
      await expect(wf.sendOffers(partner, id, [propertyId])).rejects.toThrow();
      await expect(wf.resubmitOffer(otherPartner, offerId)).rejects.toThrow();

      await wf.resubmitOffer(partner, offerId);
      expect((await offerOf(id)).review).toBe('pending');
      expect((await offerOf(id)).rejectReason).toBeNull();
    });

    it('re-reviews live offers when the partner changes the property', async () => {
      const id = await approvedRequest();
      const offerId = await approvedOffer(id);
      await wf.setInterest(broker, offerId, true);

      await records.updateProperty(partner, propertyId, PROPERTY);
      expect((await offerOf(id)).review).toBe('approved');

      await records.updateProperty(partner, propertyId, { ...PROPERTY, price: 140000 });
      expect((await offerOf(id)).review).toBe('pending');
      expect((await offerOf(id)).state).toBe('interested');
      expect(await stageOf(id)).toBe('in_progress');
      expect((await lists.requestDetail(broker, id)).offers).toEqual([]);
      await expectScopesMatchRules();

      await wf.approveOffer(admin, offerId);
      await records.updateProperty(admin, propertyId, { ...PROPERTY, price: 145000 });
      expect((await offerOf(id)).review).toBe('approved');
    });
  });

  describe('reservations', () => {
    it('holds a reserved property against other requests until it is returned', async () => {
      const first = await approvedRequest();
      const second = await approvedRequest();
      const freeProperty = await newProperty();
      for (const [request, property] of [
        [first, propertyId],
        [second, propertyId],
        [second, freeProperty],
      ]) {
        await wf.setInterest(broker, await approvedOffer(request, property), true);
      }

      await wf.transfer(broker, first);
      const detail = async (request: string, property: string) =>
        (await lists.requestDetail(broker, request)).offers.find(
          (o) => o.propertyId === property,
        )!;
      expect((await detail(first, propertyId)).reservedElsewhere).toBe(false);
      expect((await detail(second, propertyId)).reservedElsewhere).toBe(true);

      // The held property is left out; the free one is reserved.
      await wf.transfer(broker, second);
      const [secondTransfer] = await db
        .select()
        .from(t.transfers)
        .where(eq(t.transfers.requestId, second));
      expect(secondTransfer.offerIds).toEqual([(await offerOf(second, freeProperty)).id]);
      expect((await offerOf(second, propertyId)).state).toBe('interested');

      // A request whose only booked property is held cannot reserve.
      const third = await approvedRequest();
      await wf.setInterest(broker, await approvedOffer(third), true);
      await expect(wf.transfer(broker, third)).rejects.toThrow(/уже зарезервированы/);

      const [firstTransfer] = await db
        .select()
        .from(t.transfers)
        .where(eq(t.transfers.requestId, first));
      await wf.returnTransfer(admin, firstTransfer.id, 'Клиент отказался');
      const returned = (await lists.requestDetail(broker, first)).transfers[0];
      expect(returned.returnReason).toBe('Клиент отказался');
      expect((await lists.requestDetail(partner, first)).transfers[0].returnReason).toBeNull();
      expect((await detail(third, propertyId)).reservedElsewhere).toBe(false);

      await wf.transfer(broker, third);
      const [thirdTransfer] = await db
        .select()
        .from(t.transfers)
        .where(eq(t.transfers.requestId, third));
      await wf.sell(admin, thirdTransfer.id, propertyId);
      expect(await stageOf(third)).toBe('sold');
      expect((await offerOf(first)).state).toBe('unavailable');
      await expectScopesMatchRules();
    });

    it('leaves out a booked property sold while the reservation waits for its lock', async () => {
      const id = await approvedRequest();
      const offerId = await approvedOffer(id);
      await wf.setInterest(broker, offerId, true);

      // Hold the property row as a concurrent sale would, so `transfer` reads
      // its context first and then blocks on the lock.
      const sale = await pool.connect();
      try {
        await sale.query('begin');
        await sale.query('select 1 from properties where id = $1 for update', [propertyId]);
        const reserving = wf.transfer(broker, id);
        const waiting = async () =>
          (
            await pool.query<{ n: number }>(
              `select count(*)::int as n from pg_stat_activity
               where datname = current_database() and wait_event_type = 'Lock'`,
            )
          ).rows[0].n > 0;
        for (let i = 0; i < 100 && !(await waiting()); i++)
          await new Promise((r) => setTimeout(r, 20));
        await sale.query(`update properties set availability = 'sold' where id = $1`, [
          propertyId,
        ]);
        await sale.query(`update offers set state = 'unavailable' where id = $1`, [offerId]);
        await sale.query('commit');
        await expect(reserving).rejects.toThrow(/хотя бы одно доступное/);
      } finally {
        sale.release();
      }
      expect((await offerOf(id)).state).toBe('unavailable');
      expect(await db.select().from(t.transfers).where(eq(t.transfers.requestId, id))).toEqual(
        [],
      );
      expect(await stageOf(id)).not.toBe('crm');
    });
  });

  describe('visibility of reference data', () => {
    it('never tells a broker which partner is behind an offer', async () => {
      const id = await approvedRequest();
      await wf.sendOffers(partner, id, [propertyId]);
      const { id: offerId } = await offerOf(id);
      await wf.declineOffer(admin, offerId, 'Нет фото');
      await wf.resubmitOffer(partner, offerId);
      await wf.approveOffer(admin, offerId);

      const detail = await lists.requestDetail(broker, id);
      expect(detail.offers.map((o) => [o.companyId, o.rejectReason, o.reviewedAt])).toEqual([
        ['', null, null],
      ]);
      expect(detail.properties.map((p) => p.companyId)).toEqual(['']);
      const property = await lists.propertyDetail(broker, propertyId);
      expect(property.properties[0].companyId).toBe('');
      expect(property.offers.every((o) => o.companyId === '')).toBe(true);
      // Filtering by company would reveal the owner, so it is ignored for brokers.
      expect(
        (await lists.propertiesFeed(broker, { ...PAGE, company: 'AM-3' })).items.map(
          (p) => p.id,
        ),
      ).toEqual([propertyId]);

      expect((await lists.requestDetail(partner, id)).offers[0].companyId).toBe('AM-2');
      expect((await lists.requestDetail(admin, id)).offers[0].reviewedAt).not.toBeNull();
    });

    it('gives brokers and partners only their own company', async () => {
      const ids = async (u: AuthUser) =>
        (await insights.bootstrap(u)).companies.map((c) => c.id);
      expect(await ids(broker)).toEqual(['RF-1']);
      expect(await ids(partner)).toEqual(['AM-2']);
      expect(await ids(admin)).toHaveLength(3);
    });

    it('keeps anonymous market totals on the broker district map', async () => {
      const stats = await insights.districtStats(broker);
      expect(stats['Кентрон']).toEqual({ count: 1, minPrice: 150000 });
    });
  });

  describe('review notifications', () => {
    it('tells each role only what it may know', async () => {
      const id = await newRequest();
      await wf.submit(broker, id);
      await wf.rejectRequest(admin, id, 'Уточните бюджет');
      await wf.submit(broker, id);
      expect(await eventTypes(partner)).toEqual([]);
      await wf.approveRequest(admin, id);

      await wf.sendOffers(partner, id, [propertyId]);
      const { id: offerId } = await offerOf(id);
      await wf.declineOffer(admin, offerId, 'Нет фото');
      await wf.resubmitOffer(partner, offerId);
      await wf.approveOffer(admin, offerId);

      await records.updateRequest(broker, id, { ...REQUEST, rooms: 3 });
      await wf.approveRequest(admin, id);
      await records.updateProperty(partner, propertyId, { ...PROPERTY, price: 140000 });
      await wf.approveOffer(admin, offerId);

      expect(await eventTypes(broker)).toEqual([
        'request_submitted',
        'request_rejected',
        'request_submitted',
        'started',
        'offers_sent',
        'request_submitted',
        'request_approved',
        'offers_sent',
      ]);
      expect(await eventTypes(partner)).toEqual([
        'started',
        'offer_submitted',
        'offer_rejected',
        'offer_submitted',
        'offers_sent',
        'offer_submitted',
        'offers_sent',
      ]);
      expect(await eventTypes(otherPartner)).toEqual(['started']);
      expect(await eventTypes(admin)).toHaveLength(12);
      expect(
        (await lists.notifications(admin, { limit: 100, filter: 'review' })).items,
      ).toHaveLength(12);
      expect((await insights.bootstrap(broker)).unreadCount).toBe(8);
      await expectScopesMatchRules();
    });
  });
});
