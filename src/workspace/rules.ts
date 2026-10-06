import type { AuthUser } from '../auth/auth.types.js';
import type {
  EventView,
  OfferView,
  RequestStage,
  RequestView,
  WorkspaceState,
} from './workspace.types.js';

/** Business rules shared by the snapshot projection and the workflow actions. */
export const OPEN_STAGES: RequestStage[] = ['in_progress', 'has_offers'];
export const CLOSED_STAGES: RequestStage[] = ['crm', 'sold'];
/** Not approved by an admin (yet, or again after an edit): hidden from partners. */
export const UNAPPROVED_STAGES: RequestStage[] = [
  'created',
  'pending_review',
  'rejected',
];
/** Stages a broker may send for admin review. */
export const SUBMITTABLE_STAGES: RequestStage[] = ['created', 'rejected'];
export const SELECTED_OFFER_STATES = ['interested', 'transferred'] as const;
/** Admin review of requests: between the broker and the admin only. */
export const REQUEST_REVIEW_EVENTS: EventView['type'][] = [
  'request_submitted',
  'request_approved',
  'request_rejected',
];
/** Admin review of offers: brokers only ever learn about approved offers. */
export const OFFER_REVIEW_EVENTS: EventView['type'][] = [
  'offer_submitted',
  'offer_rejected',
];

export const isOpenStage = (stage: RequestStage) => OPEN_STAGES.includes(stage);

/** Brokers only see offers an admin approved. */
export const canSeeOffer = (user: AuthUser, offer: Pick<OfferView, 'review'>) =>
  user.role !== 'broker' || offer.review === 'approved';

/** Approved, still open, and its property is published. */
export const isOfferAvailable = (
  offer: Pick<OfferView, 'state' | 'review'>,
  propertyAvailability: string | undefined,
) =>
  offer.review === 'approved' &&
  offer.state !== 'closed' &&
  offer.state !== 'unavailable' &&
  propertyAvailability === 'active';

type MatchRequest = Pick<
  RequestView,
  'districts' | 'budgetMin' | 'budgetMax' | 'areaMin' | 'areaMax' | 'rooms' | 'type'
>;
interface MatchProperty {
  district: string;
  price: number;
  area: number;
  rooms: number | null;
  type: string;
}

const within = (value: number, min: number, max: number) =>
  (!min || value >= min) && (!max || value <= max);

/** 0–100 fit of a property to a request: district, budget, area, rooms and type. */
export function matchScore(request: MatchRequest, property: MatchProperty) {
  const checks: [weight: number, ok: boolean][] = [
    [30, !request.districts.length || request.districts.includes(property.district)],
    [30, within(property.price, request.budgetMin, request.budgetMax)],
    [15, within(property.area, request.areaMin, request.areaMax)],
    [15, request.rooms === null || property.rooms === request.rooms],
    [10, property.type === request.type],
  ];
  return checks.reduce((sum, [weight, ok]) => sum + (ok ? weight : 0), 0);
}

export function canSeeRequest(
  user: AuthUser,
  request: Pick<RequestView, 'id' | 'stage'>,
  clientCompanyId: string | undefined,
  offers: Pick<OfferView, 'requestId' | 'companyId'>[],
): boolean {
  if (user.role === 'admin') return true;
  if (user.role === 'broker') return clientCompanyId === user.companyId;
  return (
    isOpenStage(request.stage) ||
    (CLOSED_STAGES.includes(request.stage) &&
      offers.some(
        (o) => o.requestId === request.id && o.companyId === user.companyId,
      ))
  );
}

export function isEventVisible(
  user: AuthUser,
  event: EventView,
  request: RequestView,
  state: Pick<WorkspaceState, 'offers'>,
): boolean {
  if (user.role === 'admin') return true;
  if (user.role === 'broker') return !OFFER_REVIEW_EVENTS.includes(event.type);
  if (event.type === 'started') return isOpenStage(request.stage);
  if (REQUEST_REVIEW_EVENTS.includes(event.type)) return false;
  if (UNAPPROVED_STAGES.includes(request.stage)) return false;
  return state.offers.some(
    (o) =>
      o.requestId === request.id &&
      o.companyId === user.companyId &&
      (!event.propertyId || o.propertyId === event.propertyId),
  );
}
