import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import type { AuthUser } from '../auth/auth.types.js';
import { DB, type Database } from '../database/database.module.js';
import * as t from '../database/schema.js';
import type { Analytics, Bootstrap, DistrictStats, Metrics } from './lists.types.js';
import { toCompanyView, toRequestView, toTransferView } from './mappers.js';
import {
  attentionSql,
  eventScope,
  propertyScope,
  requestScope,
  SELECTED_STATES,
} from './scope.js';
import { SlicesService } from './slices.service.js';
import type { RequestStage } from './workspace.types.js';

const OVERVIEW_LIMIT = 20;

const int = (expr: ReturnType<typeof sql>) => sql<number>`(${expr})::int`;

@Injectable()
export class InsightsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly slices: SlicesService,
  ) {}

  async bootstrap(user: AuthUser): Promise<Bootstrap> {
    const unread = sql`not exists (select 1 from ${t.eventReads} er where er.event_id = ${t.events.id} and er.user_id = ${user.id})`;
    const [
      companies,
      employees,
      [{ unreadCount }],
      [{ attentionCount }],
      pendingRegistrations,
      pendingRequests,
      pendingOffers,
    ] = await Promise.all([
      // Others' companies are admin-only; brokers and partners get their own.
      this.db
        .select()
        .from(t.companies)
        .where(
          user.role === 'admin'
            ? undefined
            : eq(t.companies.id, user.companyId ?? ''),
        )
        .orderBy(asc(t.companies.id)),
      this.db
        .select()
        .from(t.employees)
        .where(
          user.role === 'admin'
            ? undefined
            : eq(t.employees.companyId, user.companyId ?? ''),
        )
        .orderBy(asc(t.employees.id)),
      this.db
        .select({ unreadCount: count() })
        .from(t.events)
        .where(and(eventScope(user), unread)),
      this.db
        .select({ attentionCount: count() })
        .from(t.requests)
        .where(and(requestScope(user), attentionSql)),
      // Only admins review sign-ups, so others skip the query.
      user.role === 'admin'
        ? this.db
            .select({ total: count() })
            .from(t.registrationRequests)
            .where(eq(t.registrationRequests.status, 'pending'))
            .then(([row]) => row.total)
        : 0,
      user.role === 'admin'
        ? this.db
            .select({ total: count() })
            .from(t.requests)
            .where(eq(t.requests.stage, 'pending_review'))
            .then(([row]) => row.total)
        : 0,
      user.role === 'admin'
        ? this.db
            .select({ total: count() })
            .from(t.offers)
            .where(eq(t.offers.review, 'pending'))
            .then(([row]) => row.total)
        : 0,
    ]);
    return {
      companies: companies.map(toCompanyView),
      employees,
      unreadCount,
      attentionCount,
      pendingRegistrations,
      pendingRequests,
      pendingOffers,
    };
  }

  async analytics(user: AuthUser): Promise<Analytics> {
    const scope = requestScope(user) ?? sql`true`;
    const company = user.companyId ?? '';
    const partner = user.role === 'partner';
    const ownOffer = partner
      ? sql`o.company_id = ${company}`
      : user.role === 'broker'
        ? sql`o.review = 'approved'`
        : sql`true`;

    const [
      [requestAgg],
      stages,
      districts,
      [{ clients }],
      offerAgg,
      transferAgg,
      [propertyAgg],
      companies,
      pending,
      attention,
    ] = await Promise.all([
      this.db
        .select({
          requests: count(),
          activeRequests: int(sql`count(*) filter (where ${t.requests.stage} <> 'sold')`),
          attention: int(sql`count(*) filter (where ${attentionSql})`),
        })
        .from(t.requests)
        .where(scope),
      this.db
        .select({ stage: t.requests.stage, total: count() })
        .from(t.requests)
        .where(scope)
        .groupBy(t.requests.stage),
      this.db.execute<{ district: string; total: number }>(
        sql`select d as district, count(*)::int as total
            from ${t.requests}, unnest(${t.requests.districts}) d
            where ${scope} group by d`,
      ),
      partner
        ? this.db
            .select({ clients: int(sql`count(distinct ${t.requests.clientId})`) })
            .from(t.requests)
            .where(scope)
        : this.db
            .select({ clients: count() })
            .from(t.clients)
            .where(
              user.role === 'broker' ? eq(t.clients.companyId, company) : undefined,
            ),
      this.db.execute<{ offers: number; interested: number }>(
        sql`select count(*)::int as offers,
              count(distinct o.request_id) filter (
                where o.state in ${SELECTED_STATES} and p.availability = 'active'
                  and ${t.requests.stage} <> 'sold')::int as interested
            from ${t.offers} o
            join ${t.requests} on ${t.requests.id} = o.request_id
            join ${t.properties} p on p.id = o.property_id
            where ${scope} and ${ownOffer}`,
      ),
      this.db.execute<{ activeTransfers: number; reachedCrm: number; sold: number }>(
        sql`select count(*) filter (where tr.state = 'demo_transferred')::int as "activeTransfers",
              count(distinct tr.request_id)::int as "reachedCrm",
              count(*) filter (where tr.state = 'sold')::int as sold
            from ${t.transfers} tr
            join ${t.requests} on ${t.requests.id} = tr.request_id
            where ${scope}`,
      ),
      this.db
        .select({
          properties: count(),
          soldProperties: int(sql`count(*) filter (where ${t.properties.availability} = 'sold')`),
        })
        .from(t.properties)
        .where(partner ? eq(t.properties.companyId, company) : undefined),
      user.role === 'admin' ? this.companyActivity() : Promise.resolve([]),
      this.db
        .select({ transfer: t.transfers })
        .from(t.transfers)
        .innerJoin(t.requests, eq(t.requests.id, t.transfers.requestId))
        .where(and(eq(t.transfers.state, 'demo_transferred'), scope))
        .orderBy(desc(t.transfers.createdAt))
        .limit(OVERVIEW_LIMIT),
      this.db
        .select()
        .from(t.requests)
        .where(and(scope, attentionSql))
        .orderBy(desc(t.requests.createdAt))
        .limit(OVERVIEW_LIMIT),
    ]);

    const offers = offerAgg.rows[0];
    const transfers = transferAgg.rows[0];
    const metrics: Metrics = {
      clients,
      requests: requestAgg.requests,
      activeRequests: requestAgg.activeRequests,
      offers: offers?.offers ?? 0,
      interested: offers?.interested ?? 0,
      activeTransfers: transfers?.activeTransfers ?? 0,
      reachedCrm: transfers?.reachedCrm ?? 0,
      sold: transfers?.sold ?? 0,
      attention: requestAgg.attention,
      properties: propertyAgg.properties,
      soldProperties: propertyAgg.soldProperties,
    };
    const stageCounts: Partial<Record<RequestStage, number>> = {};
    for (const s of stages) stageCounts[s.stage] = s.total;
    const pendingTransfers = pending.map((p) => p.transfer);

    return {
      metrics,
      districts: Object.fromEntries(
        districts.rows.map((d) => [d.district, d.total]),
      ),
      stages: stageCounts,
      companies,
      overview: {
        transfers: pendingTransfers.map(toTransferView),
        attention: attention.map(toRequestView),
        slice: await this.slices.forRequests(user, [
          ...pendingTransfers.map((tr) => tr.requestId),
          ...attention.map((r) => r.id),
        ]),
      },
    };
  }

  private companyActivity() {
    return this.db
      .select({
        id: t.companies.id,
        name: t.companies.name,
        kind: t.companies.kind,
        count: int(sql`case when ${t.companies.kind} = 'rf'
          then (select count(*) from ${t.requests} r join ${t.clients} c on c.id = r.client_id where c.company_id = ${t.companies.id})
          else (select count(*) from ${t.offers} o where o.company_id = ${t.companies.id}) end`),
      })
      .from(t.companies)
      .orderBy(asc(t.companies.id));
  }

  /**
   * Active listings per district. Brokers get anonymous whole-market totals;
   * partners only their own listings.
   */
  async districtStats(user: AuthUser): Promise<DistrictStats> {
    const rows = await this.db
      .select({
        district: t.properties.district,
        total: count(),
        minPrice: sql<number | null>`min(${t.properties.price})`,
      })
      .from(t.properties)
      .where(
        and(
          user.role === 'broker' ? undefined : propertyScope(user),
          eq(t.properties.availability, 'active'),
        ),
      )
      .groupBy(t.properties.district);
    return Object.fromEntries(
      rows.map((r) => [r.district, { count: r.total, minPrice: r.minPrice }]),
    );
  }
}
