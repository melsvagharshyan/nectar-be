import type { CursorPage, OffsetPage } from './pagination.js';
import type {
  ClientView,
  CompanyView,
  EmployeeView,
  EventView,
  OfferView,
  PropertyAvailability,
  PropertyView,
  RequestStage,
  RequestView,
  TransferView,
} from './workspace.types.js';

/** Records related to a page of items, already scoped to the caller's role. */
export interface Slice {
  clients: ClientView[];
  requests: RequestView[];
  properties: PropertyView[];
  offers: OfferView[];
  transfers: TransferView[];
  drafts: Record<string, string[]>;
  events: EventView[];
}

export type WithSlice<P> = P & { slice: Slice };

export interface MutationResult {
  ok: true;
}

export interface Bootstrap {
  companies: CompanyView[];
  employees: EmployeeView[];
  unreadCount: number;
  attentionCount: number;
  /** Sign-ups awaiting review; always 0 for non-admins. */
  pendingRegistrations: number;
  /** Requests waiting for admin review; 0 for non-admins. */
  pendingRequests: number;
  /** Offers waiting for admin review; 0 for non-admins. */
  pendingOffers: number;
}

/** `total` is only computed for the first page (no cursor). */
type CountedPage<T> = CursorPage<T> & { total?: number };

export type ClientsPage = WithSlice<CountedPage<ClientView>>;
export type RequestsPage = WithSlice<CountedPage<RequestView>>;
export type RequestsTable = WithSlice<OffsetPage<RequestView>>;
export type OffersTable = WithSlice<OffsetPage<OfferView>>;

export interface PropertyListMeta {
  total: number;
  statusCounts: Partial<Record<PropertyAvailability, number>>;
  districts: string[];
}

export type PropertiesTable = OffsetPage<PropertyView> &
  PropertyListMeta & { offers: OfferView[] };

export type PropertiesFeed = CursorPage<PropertyView> &
  Partial<PropertyListMeta> & { offers: OfferView[] };

export type NotificationItem = EventView & { read: boolean };

export interface CompanyListItem extends CompanyView {
  stats: [number, number];
}

export type CompaniesPage = CursorPage<CompanyListItem> & {
  counts: Record<'rf' | 'am', number>;
};

export interface Metrics {
  clients: number;
  requests: number;
  activeRequests: number;
  offers: number;
  interested: number;
  activeTransfers: number;
  reachedCrm: number;
  sold: number;
  attention: number;
  properties: number;
  soldProperties: number;
}

export interface Analytics {
  metrics: Metrics;
  districts: Record<string, number>;
  stages: Partial<Record<RequestStage, number>>;
  companies: { id: string; name: string; kind: 'rf' | 'am'; count: number }[];
  overview: WithSlice<{ transfers: TransferView[]; attention: RequestView[] }>;
}

export type DistrictStats = Record<string, { count: number; minPrice: number | null }>;
