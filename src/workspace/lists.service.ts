import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lte,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { AuthUser } from '../auth/auth.types.js';
import { DB, type Database } from '../database/database.module.js';
import * as t from '../database/schema.js';
import type {
  ClientsQueryDto,
  CompaniesQueryDto,
  NotificationsQueryDto,
  OffersTableQueryDto,
  PropertiesQueryDto,
  RequestsQueryDto,
  AdminRequestFilters,
} from './lists.dto.js';
import type {
  ClientsPage,
  CompaniesPage,
  NotificationItem,
  OffersTable,
  PropertiesFeed,
  PropertiesTable,
  PropertyListMeta,
  RequestsPage,
  RequestsTable,
  Slice,
} from './lists.types.js';
import {
  toClientView,
  toCompanyView,
  toEventView,
  toOfferView,
  toPropertyView,
  toRequestView,
} from './mappers.js';
import {
  afterCursor,
  cursorAt,
  pageOffset,
  searchSql,
  toCursorPage,
  type CursorPage,
} from './pagination.js';
import {
  attentionSql,
  eventScope,
  offerScope,
  openStageSql,
  ownOfferSql,
  propertyScope,
  requestScope,
  SELECTED_STATES,
  stageSql,
} from './scope.js';
import { emptySlice, SlicesService } from './slices.service.js';
import type { CompanyView, EventView, PropertyAvailability } from './workspace.types.js';

const CRM_EVENT_TYPES = sql`('transferred', 'returned', 'sold')`;
const REVIEW_EVENT_TYPES = sql`('request_submitted', 'request_approved', 'request_rejected',
  'offer_submitted', 'offer_rejected', 'offers_sent', 'started')`;
const CLOSED_OFFER_STATES = sql`('closed', 'unavailable')`;

const requestSearch = (search?: string) =>
  searchSql(
    search,
    sql`${t.requests.id}`,
    sql`${t.requests.type}`,
    sql`array_to_string(${t.requests.districts}, ' ')`,
  );

const clientOfCompany = (companyId: string) =>
  sql`exists (select 1 from ${t.clients} c where c.id = ${t.requests.clientId} and c.company_id = ${companyId})`;

function adminViewSql(view?: AdminRequestFilters['view']): SQL | undefined {
  switch (view) {
    case 'review':
      return sql`${t.requests.stage} = 'pending_review'`;
    case 'active':
      return sql`${t.requests.stage} <> 'sold'`;
    case 'crm':
    case 'sold':
      return sql`${t.requests.stage} = ${view}`;
    case 'offers':
      return sql`exists (select 1 from ${t.offers} o where o.request_id = ${t.requests.id})`;
    case 'interested':
      return sql`exists (select 1 from ${t.offers} o where o.request_id = ${t.requests.id} and o.state in ${SELECTED_STATES})`;
    default:
      return undefined;
  }
}

const adminRequestConds = (q: AdminRequestFilters, byPartnerOffer = true) => [
  requestSearch(q.search),
  q.company ? clientOfCompany(q.company) : undefined,
  byPartnerOffer && q.partner ? ownOfferSql(q.partner) : undefined,
  q.attention ? attentionSql : undefined,
  adminViewSql(q.view),
];

function mergeSlices(...slices: Slice[]): Slice {
  const byId = <T extends { id: string }>(lists: T[][]) => [
    ...new Map(lists.flat().map((item) => [item.id, item])).values(),
  ];
  return {
    clients: byId(slices.map((s) => s.clients)),
    requests: byId(slices.map((s) => s.requests)),
    properties: byId(slices.map((s) => s.properties)),
    offers: byId(slices.map((s) => s.offers)),
    transfers: byId(slices.map((s) => s.transfers)),
    drafts: Object.assign({}, ...slices.map((s) => s.drafts)),
    events: byId(slices.map((s) => s.events)),
  };
}

@Injectable()
export class ListsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly slices: SlicesService,
  ) {}

  async clients(user: AuthUser, q: ClientsQueryDto): Promise<ClientsPage> {
    const company = user.role === 'admin' ? q.company : user.companyId;
    if (!company) throw new ForbiddenException('Не выбрана компания');
    const stage = stageSql(q.stage);
    const filters = and(
      eq(t.clients.companyId, company),
      q.manager ? eq(t.clients.employeeId, q.manager) : undefined,
      searchSql(
        q.search,
        sql`${t.clients.name}`,
        sql`${t.clients.id}`,
        sql`${t.clients.phone}`,
      ),
      stage
        ? sql`exists (select 1 from ${t.requests} where ${t.requests.clientId} = ${t.clients.id} and ${stage})`
        : undefined,
    );

    const [rows, total] = await Promise.all([
      this.db
        .select({ row: t.clients, cursorAt: cursorAt(t.clients.createdAt) })
        .from(t.clients)
        .where(
          and(filters, afterCursor(t.clients.createdAt, t.clients.id, q.cursor)),
        )
        .orderBy(desc(t.clients.createdAt), desc(t.clients.id))
        .limit(q.limit + 1),
      q.cursor ? undefined : this.db.$count(t.clients, filters),
    ]);

    const page = toCursorPage(rows, q.limit);
    const clientIds = page.items.map((c) => c.id);
    const requestIds = clientIds.length
      ? (
          await this.db
            .select({ id: t.requests.id })
            .from(t.requests)
            .where(inArray(t.requests.clientId, clientIds))
        ).map((r) => r.id)
      : [];
    return {
      items: page.items.map((c) => toClientView(user, c)),
      nextCursor: page.nextCursor,
      total,
      slice: await this.slices.forRequests(user, requestIds),
    };
  }

  async clientDetail(user: AuthUser, id: string): Promise<Slice> {
    const [client] = await this.db
      .select()
      .from(t.clients)
      .where(
        and(
          eq(t.clients.id, id),
          user.role === 'admin'
            ? undefined
            : eq(t.clients.companyId, user.companyId ?? ''),
        ),
      );
    if (!client) throw new NotFoundException('Клиент не найден');
    const requests = await this.db
      .select({ id: t.requests.id })
      .from(t.requests)
      .where(eq(t.requests.clientId, id));
    const slice = await this.slices.forRequests(
      user,
      requests.map((r) => r.id),
    );
    return mergeSlices(slice, {
      ...emptySlice(),
      clients: [toClientView(user, client)],
    });
  }

  async requests(user: AuthUser, q: RequestsQueryDto): Promise<RequestsPage> {
    const company = user.role === 'admin' ? q.company : undefined;
    const filters = and(
      requestScope(user),
      q.clientId ? eq(t.requests.clientId, q.clientId) : undefined,
      company ? clientOfCompany(company) : undefined,
      stageSql(q.stage),
      q.filter === 'mine' ? ownOfferSql(user.companyId ?? '') : undefined,
      q.filter === 'open' ? openStageSql : undefined,
      requestSearch(q.search),
    );
    const [rows, total] = await Promise.all([
      this.db
        .select({ row: t.requests, cursorAt: cursorAt(t.requests.createdAt) })
        .from(t.requests)
        .where(
          and(filters, afterCursor(t.requests.createdAt, t.requests.id, q.cursor)),
        )
        .orderBy(desc(t.requests.createdAt), desc(t.requests.id))
        .limit(q.limit + 1),
      q.cursor ? undefined : this.db.$count(t.requests, filters),
    ]);

    const page = toCursorPage(rows, q.limit);
    return {
      items: page.items.map(toRequestView),
      nextCursor: page.nextCursor,
      total,
      slice: await this.slices.forRequests(
        user,
        page.items.map((r) => r.id),
      ),
    };
  }

  async requestsTable(
    user: AuthUser,
    q: AdminRequestFilters,
  ): Promise<RequestsTable> {
    const where = and(requestScope(user), ...adminRequestConds(q));
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(t.requests)
        .where(where)
        .orderBy(desc(t.requests.createdAt), desc(t.requests.id))
        .limit(q.limit)
        .offset(pageOffset(q)),
      this.db.select({ total: count() }).from(t.requests).where(where),
    ]);
    return {
      items: rows.map(toRequestView),
      total,
      page: q.page,
      limit: q.limit,
      slice: await this.slices.forRequests(
        user,
        rows.map((r) => r.id),
      ),
    };
  }

  async requestDetail(user: AuthUser, id: string): Promise<Slice> {
    const slice = await this.slices.forRequests(user, [id], { events: true });
    if (!slice.requests.length) throw new NotFoundException('Запрос не найден');
    return slice;
  }

  async offersTable(user: AuthUser, q: OffersTableQueryDto): Promise<OffersTable> {
    const state =
      q.state === 'closed_any'
        ? sql`${t.offers.state} in ${CLOSED_OFFER_STATES}`
        : q.state
          ? eq(t.offers.state, q.state)
          : undefined;
    const where = and(
      offerScope(user),
      requestScope(user),
      state,
      q.review ? eq(t.offers.review, q.review) : undefined,
      ...(user.role === 'admin'
        ? [
            ...adminRequestConds(q, false),
            q.partner ? eq(t.offers.companyId, q.partner) : undefined,
          ]
        : []),
    );
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({ offer: t.offers })
        .from(t.offers)
        .innerJoin(t.requests, eq(t.requests.id, t.offers.requestId))
        .where(where)
        .orderBy(desc(t.offers.createdAt), desc(t.offers.id))
        .limit(q.limit)
        .offset(pageOffset(q)),
      this.db
        .select({ total: count() })
        .from(t.offers)
        .innerJoin(t.requests, eq(t.requests.id, t.offers.requestId))
        .where(where),
    ]);
    const offers = rows.map((r) => r.offer);
    return {
      items: await this.slices.withReservations(offers.map(toOfferView)),
      total,
      page: q.page,
      limit: q.limit,
      slice: await this.slices.forRequests(
        user,
        offers.map((o) => o.requestId),
      ),
    };
  }

  private propertyBase(user: AuthUser) {
    return and(
      propertyScope(user),
      user.role === 'broker' ? eq(t.properties.availability, 'active') : undefined,
    );
  }

  private propertyWhere(user: AuthUser, q: PropertiesQueryDto) {
    return and(
      this.propertyBase(user),
      q.status ? eq(t.properties.availability, q.status) : undefined,
      searchSql(
        q.search,
        sql`${t.properties.id}`,
        sql`${t.properties.title}`,
        sql`${t.properties.district}`,
      ),
      q.district ? eq(t.properties.district, q.district) : undefined,
      q.price ? lte(t.properties.price, q.price) : undefined,
      q.area ? gte(t.properties.area, q.area) : undefined,
      q.rooms ? eq(t.properties.rooms, q.rooms) : undefined,
      q.company ? eq(t.properties.companyId, q.company) : undefined,
      q.matchRequest
        ? sql`${t.properties.availability} = 'active' and exists (
            select 1 from ${t.requests} r where r.id = ${q.matchRequest}
              and ${t.properties.district} = any(r.districts) and ${t.properties.price} <= r.budget_max)`
        : undefined,
    );
  }

  private async propertyMeta(
    user: AuthUser,
    q: PropertiesQueryDto,
  ): Promise<PropertyListMeta> {
    const base = this.propertyBase(user);
    const [[{ total }], statuses, districts] = await Promise.all([
      this.db
        .select({ total: count() })
        .from(t.properties)
        .where(this.propertyWhere(user, q)),
      this.db
        .select({ status: t.properties.availability, total: count() })
        .from(t.properties)
        .where(base)
        .groupBy(t.properties.availability),
      this.db
        .selectDistinct({ district: t.properties.district })
        .from(t.properties)
        .where(base)
        .orderBy(asc(t.properties.district)),
    ]);
    const statusCounts: Partial<Record<PropertyAvailability, number>> = {};
    for (const s of statuses) statusCounts[s.status] = s.total;
    return { total, statusCounts, districts: districts.map((d) => d.district) };
  }

  async propertiesTable(
    user: AuthUser,
    q: PropertiesQueryDto,
  ): Promise<PropertiesTable> {
    const [rows, meta] = await Promise.all([
      this.db
        .select()
        .from(t.properties)
        .where(this.propertyWhere(user, q))
        .orderBy(desc(t.properties.createdAt), desc(t.properties.id))
        .limit(q.limit)
        .offset(pageOffset(q)),
      this.propertyMeta(user, q),
    ]);
    return {
      items: rows.map((p) => toPropertyView(user, p)),
      page: q.page,
      limit: q.limit,
      ...meta,
      offers: await this.slices.offersForProperties(
        user,
        rows.map((p) => p.id),
      ),
    };
  }

  async propertiesFeed(
    user: AuthUser,
    q: PropertiesQueryDto,
  ): Promise<PropertiesFeed> {
    const [rows, meta] = await Promise.all([
      this.db
        .select({ row: t.properties, cursorAt: cursorAt(t.properties.createdAt) })
        .from(t.properties)
        .where(
          and(
            this.propertyWhere(user, q),
            afterCursor(t.properties.createdAt, t.properties.id, q.cursor),
          ),
        )
        .orderBy(desc(t.properties.createdAt), desc(t.properties.id))
        .limit(q.limit + 1),
      q.cursor ? Promise.resolve({}) : this.propertyMeta(user, q),
    ]);
    const page = toCursorPage(rows, q.limit);
    return {
      items: page.items.map((p) => toPropertyView(user, p)),
      nextCursor: page.nextCursor,
      ...meta,
      offers: await this.slices.offersForProperties(
        user,
        page.items.map((p) => p.id),
      ),
    };
  }

  async propertyDetail(user: AuthUser, id: string): Promise<Slice> {
    const [property] = await this.db
      .select()
      .from(t.properties)
      .where(and(eq(t.properties.id, id), propertyScope(user)));
    if (!property) throw new NotFoundException('Объект не найден');
    const offers = await this.slices.offersForProperties(user, [id]);
    const slice = await this.slices.forRequests(
      user,
      offers.map((o) => o.requestId),
    );
    return mergeSlices(slice, {
      ...emptySlice(),
      properties: [toPropertyView(user, property)],
      offers,
    });
  }

  async notifications(
    user: AuthUser,
    q: NotificationsQueryDto,
  ): Promise<CursorPage<NotificationItem>> {
    const read = sql<boolean>`exists (select 1 from ${t.eventReads} er where er.event_id = ${t.events.id} and er.user_id = ${user.id})`;
    const rows = await this.db
      .select({ row: t.events, cursorAt: cursorAt(t.events.createdAt), read })
      .from(t.events)
      .where(
        and(
          eventScope(user),
          q.filter === 'new' ? sql`not ${read}` : undefined,
          q.filter === 'crm' ? sql`${t.events.type} in ${CRM_EVENT_TYPES}` : undefined,
          q.filter === 'review' ? sql`${t.events.type} in ${REVIEW_EVENT_TYPES}` : undefined,
          afterCursor(t.events.createdAt, t.events.id, q.cursor),
        ),
      )
      .orderBy(desc(t.events.createdAt), desc(t.events.id))
      .limit(q.limit + 1);
    return toCursorPage(
      rows.map((r) => ({
        row: { ...toEventView(r.row), read: r.read },
        cursorAt: r.cursorAt,
      })),
      q.limit,
    );
  }

  async events(user: AuthUser, requestId: string): Promise<{ items: EventView[] }> {
    const slice = await this.slices.forRequests(user, [requestId], { events: true });
    if (!slice.requests.length) throw new NotFoundException('Запрос не найден');
    return { items: slice.events };
  }

  async companies(q: CompaniesQueryDto): Promise<CompaniesPage> {
    const company = sql`${t.companies.id}`;
    const isRf = sql`${t.companies.kind} = 'rf'`;
    const first = sql<number>`(case when ${isRf}
      then (select count(*) from ${t.clients} c where c.company_id = ${company})
      else (select count(*) from ${t.properties} p where p.company_id = ${company}) end)::int`;
    const second = sql<number>`(case when ${isRf}
      then (select count(*) from ${t.requests} r join ${t.clients} c on c.id = r.client_id where c.company_id = ${company})
      else (select count(*) from ${t.offers} o where o.company_id = ${company}) end)::int`;
    const filters = and(
      q.kind ? eq(t.companies.kind, q.kind) : undefined,
      searchSql(q.search, sql`${t.companies.id}`, sql`${t.companies.name}`),
    );

    const [rows, kinds] = await Promise.all([
      this.db
        .select({
          row: t.companies,
          cursorAt: cursorAt(t.companies.createdAt),
          first,
          second,
        })
        .from(t.companies)
        .where(and(filters, afterCursor(t.companies.createdAt, t.companies.id, q.cursor)))
        .orderBy(desc(t.companies.createdAt), desc(t.companies.id))
        .limit(q.limit + 1),
      this.db
        .select({ kind: t.companies.kind, total: count() })
        .from(t.companies)
        .groupBy(t.companies.kind),
    ]);
    const counts = { rf: 0, am: 0 };
    for (const k of kinds) counts[k.kind] = k.total;
    return {
      ...toCursorPage(
        rows.map((r) => ({
          row: {
            ...(toCompanyView(r.row) satisfies CompanyView),
            stats: [r.first, r.second] as [number, number],
          },
          cursorAt: r.cursorAt,
        })),
        q.limit,
      ),
      counts,
    };
  }
}
