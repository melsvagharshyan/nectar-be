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
export const SELECTED_OFFER_STATES = ['interested', 'transferred'] as const;

export const isOpenStage = (stage: RequestStage) => OPEN_STAGES.includes(stage);

export const isOfferAvailable = (
  offer: Pick<OfferView, 'state'>,
  propertyAvailability: string | undefined,
) =>
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
  if (user.role !== 'partner') return true;
  if (event.type === 'started') return isOpenStage(request.stage);
  return state.offers.some(
    (o) =>
      o.requestId === request.id &&
      o.companyId === user.companyId &&
      (!event.propertyId || o.propertyId === event.propertyId),
  );
}
