import { existsSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthUser } from '../auth/auth.types.js';
import { createDatabase, type Database } from '../database/database.module.js';
import * as t from '../database/schema.js';
import { InsightsService } from './insights.service.js';
import type { CursorPage } from './pagination.js';
import { ListsService } from './lists.service.js';
import { UNAPPROVED_STAGES } from './rules.js';
import { SlicesService } from './slices.service.js';
import { ReferenceSnapshot } from './snapshot.reference.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const DEMO = {
  broker: 'nord.broker@example.com',
  partner: 'ararat.partner@example.com',
  admin: 'admin.demo@example.com',
} as const;

const ids = (items: { id: string }[]) => items.map((i) => i.id).sort();

async function collect<T>(
  load: (cursor?: string) => Promise<CursorPage<T>>,
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await load(cursor);
    all.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return all;
}

describe.skipIf(!process.env.DATABASE_URL)('ListsService role scoping', () => {
  let pool: pg.Pool;
  let db: Database;
  let lists: ListsService;
  let insights: InsightsService;
  let workspace: ReferenceSnapshot;
  const users = {} as Record<keyof typeof DEMO, AuthUser>;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    db = createDatabase(pool);
    const slices = new SlicesService(db);
    lists = new ListsService(db, slices);
    insights = new InsightsService(db, slices);
    workspace = new ReferenceSnapshot(db);
    for (const [role, email] of Object.entries(DEMO)) {
      const [u] = await db.select().from(t.users).where(eq(t.users.email, email));
      users[role as keyof typeof DEMO] = {
        id: u.id,
        role: u.role,
        companyId: u.companyId,
      };
    }
  });

  afterAll(() => pool.end());

  it.each(Object.keys(DEMO) as (keyof typeof DEMO)[])(
    '%s sees the same requests, events and properties as the snapshot',
    async (role) => {
      const user = users[role];
      const snapshot = await workspace.snapshot(user);

      const requests = await collect((cursor) =>
        lists.requests(user, { cursor, limit: 50 }),
      );
      expect(ids(requests)).toEqual(ids(snapshot.requests));
      expect((await lists.requests(user, { limit: 1 })).total).toBe(
        snapshot.requests.length,
      );

      const events = await collect((cursor) =>
        lists.notifications(user, { cursor, limit: 50 }),
      );
      expect(ids(events)).toEqual(ids(snapshot.events));

      const unread = events.filter((e) => !e.read).length;
      expect((await insights.bootstrap(user)).unreadCount).toBe(unread);

      if (role !== 'broker') {
        const properties = await collect((cursor) =>
          lists.propertiesFeed(user, { cursor, limit: 50, page: 1 }),
        );
        expect(ids(properties)).toEqual(ids(snapshot.properties));
      }
    },
    60_000,
  );

  it('broker lists only own clients, with partner-private fields hidden', async () => {
    const user = users.broker;
    const snapshot = await workspace.snapshot(user);
    const clients = await collect((cursor) =>
      lists.clients(user, { cursor, limit: 50 }),
    );
    expect(ids(clients)).toEqual(ids(snapshot.clients));
    expect((await lists.clients(user, { limit: 1 })).total).toBe(
      snapshot.clients.length,
    );

    const feed = await lists.propertiesFeed(user, { limit: 50, page: 1 });
    expect(feed.items.every((p) => p.availability === 'active')).toBe(true);
    expect(feed.items.every((p) => !p.privateNotes && !p.internalAddress)).toBe(true);
  });

  it('partner never sees unapproved requests or client contacts', async () => {
    const user = users.partner;
    const page = await lists.requests(user, { limit: 50 });
    expect(
      page.items.some((r) => UNAPPROVED_STAGES.includes(r.stage)),
    ).toBe(false);
    expect(page.slice.clients.every((c) => !c.phone && !c.email)).toBe(true);
    expect(page.slice.offers.every((o) => o.companyId === user.companyId)).toBe(true);
  });

  it('broker only sees offers an admin approved', async () => {
    const page = await lists.requests(users.broker, { limit: 50 });
    expect(page.slice.offers.every((o) => o.review === 'approved')).toBe(true);
  });

  it('paged tables report totals that match the rows', async () => {
    const admin = users.admin;
    const first = await lists.requestsTable(admin, { page: 1, limit: 3 });
    const snapshot = await workspace.snapshot(admin);
    expect(first.total).toBe(snapshot.requests.length);
    expect(first.items.length).toBe(Math.min(3, snapshot.requests.length));

    const properties = await lists.propertiesTable(admin, { page: 1, limit: 5 });
    expect(properties.total).toBe(snapshot.properties.length);
  });

  it('analytics match snapshot-derived counts', async () => {
    const admin = users.admin;
    const snapshot = await workspace.snapshot(admin);
    const { metrics } = await insights.analytics(admin);
    expect(metrics.requests).toBe(snapshot.requests.length);
    expect(metrics.offers).toBe(snapshot.offers.length);
    expect(metrics.clients).toBe(snapshot.clients.length);
    expect(metrics.properties).toBe(snapshot.properties.length);
  });
});
