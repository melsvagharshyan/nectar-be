import { existsSync } from 'node:fs';
import { eq, like, sql } from 'drizzle-orm';
import pg from 'pg';
import { createDatabase, type Database } from '../database.module.js';
import * as t from '../schema.js';

if (existsSync('.env')) process.loadEnvFile('.env');

/**
 * Adds a large synthetic dataset on top of `db:seed` for load and pagination
 * checks. Records use `B` ids (C-B1, R-B1, …) and are replaced on every run;
 * `--clear` only removes them.
 */
const COUNTS = { clients: 2000, requests: 5000, properties: 3000 };
const CHUNK = 1000;
const DAY = 24 * 60 * 60 * 1000;

const DISTRICTS = [
  'Кентрон', 'Арабкир', 'Давташен', 'Ачапняк', 'Малатия-Себастия', 'Шенгавит',
  'Эребуни', 'Нор-Норк', 'Канакер-Зейтун', 'Аван', 'Нубарашен', 'Норк-Мараш',
];
const TYPES = ['Квартира', 'Квартира', 'Квартира', 'Студия', 'Дом', 'Пентхаус', 'Коммерция'];
const FIRST = ['Анна', 'Иван', 'Мария', 'Олег', 'Елена', 'Павел', 'Ольга', 'Артур', 'Нина', 'Сергей'];
const LAST = ['Иванов', 'Петров', 'Соколов', 'Кузнецов', 'Попов', 'Лебедев', 'Козлов', 'Новиков'];

let seed = 42;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 2 ** 32;
  return seed / 2 ** 32;
};
const int = (min: number, max: number) => Math.floor(min + rand() * (max - min + 1));
const pick = <T>(items: readonly T[]) => items[Math.floor(rand() * items.length)]!;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY - int(0, DAY));

function weighted<T extends string>(weights: Record<T, number>): T {
  const entries = Object.entries(weights) as [T, number][];
  let roll = rand() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [value, weight] of entries) if ((roll -= weight) < 0) return value;
  return entries[0]![0];
}

async function insertChunks<T>(
  rows: T[],
  insert: (chunk: T[]) => Promise<unknown>,
) {
  for (let i = 0; i < rows.length; i += CHUNK) await insert(rows.slice(i, i + CHUNK));
}

async function clear(db: Database) {
  await db.delete(t.clients).where(like(t.clients.id, 'C-B%'));
  await db.delete(t.properties).where(like(t.properties.id, 'P-B%'));
}

async function generate(db: Database) {
  const brokerStaff = await db
    .select({ id: t.employees.id, companyId: t.employees.companyId })
    .from(t.employees)
    .innerJoin(t.companies, eq(t.companies.id, t.employees.companyId))
    .where(eq(t.companies.kind, 'rf'));
  const partners = await db
    .select({ id: t.companies.id })
    .from(t.companies)
    .where(eq(t.companies.kind, 'am'));
  const photos = await db
    .select({ media: t.properties.media })
    .from(t.properties)
    .where(sql`cardinality(${t.properties.media}) > 0`);
  if (!brokerStaff.length || !partners.length)
    throw new Error('Run `pnpm db:seed` first so companies and employees exist');

  const clients = Array.from({ length: COUNTS.clients }, (_, i) => {
    const employee = pick(brokerStaff);
    const n = i + 1;
    return {
      id: `C-B${n}`,
      publicId: `CL-B${n}`,
      companyId: employee.companyId,
      employeeId: employee.id,
      name: `${pick(FIRST)} ${pick(LAST)}`,
      phone: `+7 9${int(10, 99)} ${int(100, 999)}-${int(10, 99)}-${int(10, 99)}`,
      email: `bulk${n}@example.com`,
      createdAt: daysAgo(int(1, 365)),
    };
  });

  const properties = Array.from({ length: COUNTS.properties }, (_, i) => {
    const type = pick(TYPES);
    const rooms = type === 'Студия' ? 0 : type === 'Коммерция' ? null : int(1, 5);
    const area = int(28, 260);
    return {
      id: `P-B${i + 1}`,
      companyId: pick(partners).id,
      availability: weighted({ active: 75, draft: 15, sold: 10 }),
      title: `${type === 'Квартира' && rooms ? `${rooms}-комн. квартира` : type} • ${area} м²`,
      type,
      district: pick(DISTRICTS),
      price: int(40, 900) * 1000,
      area,
      rooms,
      floor: int(1, 20),
      floors: int(5, 25),
      market: pick(['Новостройка', 'Вторичный']),
      location: 'Ереван',
      description: 'Синтетический объект для проверки нагрузки.',
      media: photos.length ? pick(photos).media : [],
      createdAt: daysAgo(int(1, 365)),
    };
  });
  const active = properties.filter((p) => p.availability === 'active');

  const requests: (typeof t.requests.$inferInsert)[] = [];
  const offers: (typeof t.offers.$inferInsert)[] = [];
  const transfers: (typeof t.transfers.$inferInsert)[] = [];
  const events: (typeof t.events.$inferInsert)[] = [];
  const event = (type: (typeof t.eventType.enumValues)[number], requestId: string, at: Date, propertyId?: string) =>
    events.push({ id: `EV-B${events.length + 1}`, type, requestId, propertyId, createdAt: at });

  for (let i = 0; i < COUNTS.requests; i++) {
    const id = `R-B${i + 1}`;
    const client = pick(clients);
    const stage = weighted({ created: 10, in_progress: 30, has_offers: 35, crm: 10, sold: 15 });
    const budgetMax = int(80, 900) * 1000;
    const createdAt = daysAgo(int(0, 300));
    requests.push({
      id,
      clientId: client.id,
      stage,
      districts: [pick(DISTRICTS), pick(DISTRICTS)].filter((d, k, all) => all.indexOf(d) === k),
      budgetMin: Math.round(budgetMax * 0.6),
      budgetMax,
      areaMin: int(30, 80),
      areaMax: int(90, 220),
      rooms: int(1, 4),
      type: pick(TYPES),
      createdAt,
    });
    if (stage === 'created') continue;
    event('started', id, createdAt);
    if (stage === 'in_progress') continue;

    const chosen = new Map<string, (typeof active)[number]>();
    const wanted = int(1, 4);
    while (chosen.size < wanted) {
      const property = pick(active);
      chosen.set(property.id, property);
    }
    const requestOffers = [...chosen.values()].map(
      (property, k): typeof t.offers.$inferInsert & { createdAt: Date } => {
        const at = new Date(createdAt.getTime() + (k + 1) * DAY);
        event('offers_sent', id, at, property.id);
        return {
          id: `OF-B${offers.length + k + 1}`,
          requestId: id,
          propertyId: property.id,
          companyId: property.companyId,
          state: 'sent',
          matchScore: int(40, 100),
          review: 'approved',
          createdAt: at,
        };
      },
    );

    if (stage === 'has_offers') {
      for (const o of requestOffers)
        if (rand() < 0.3) {
          o.state = 'interested';
          event('interest', id, o.createdAt, o.propertyId);
        }
    } else {
      const [first, ...rest] = requestOffers;
      const transferAt = new Date(createdAt.getTime() + 6 * DAY);
      event('interest', id, first!.createdAt, first!.propertyId);
      event('transferred', id, transferAt);
      if (stage === 'crm') {
        first!.state = 'transferred';
      } else {
        Object.assign(first!, { state: 'closed', closeReason: 'sold' });
        for (const o of rest) Object.assign(o, { state: 'closed', closeReason: 'not_selected' });
        event('sold', id, new Date(transferAt.getTime() + 3 * DAY), first!.propertyId);
      }
      transfers.push({
        id: `TR-B${transfers.length + 1}`,
        requestId: id,
        offerIds: [first!.id],
        state: stage === 'crm' ? 'demo_transferred' : 'sold',
        soldPropertyId: stage === 'sold' ? first!.propertyId : null,
        createdAt: transferAt,
      });
    }
    offers.push(...requestOffers);
  }

  await insertChunks(clients, (c) => db.insert(t.clients).values(c));
  await insertChunks(properties, (c) => db.insert(t.properties).values(c));
  await insertChunks(requests, (c) => db.insert(t.requests).values(c));
  await insertChunks(offers, (c) => db.insert(t.offers).values(c));
  await insertChunks(transfers, (c) => db.insert(t.transfers).values(c));
  await insertChunks(events, (c) => db.insert(t.events).values(c));
  await db.execute(sql`analyze`);

  return { clients, properties, requests, offers, transfers, events };
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const db = createDatabase(pool);
  await clear(db);
  if (!process.argv.includes('--clear')) {
    const made = await generate(db);
    console.log(
      Object.entries(made)
        .map(([name, rows]) => `${rows.length} ${name}`)
        .join(', '),
    );
  } else console.log('Bulk records removed.');
  await pool.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
