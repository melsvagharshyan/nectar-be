/** Mirrors the workspace types in nectar-estate-ui (`src/demo/types.ts`). */
export type RequestStage =
  | 'created'
  | 'pending_review'
  | 'rejected'
  | 'in_progress'
  | 'has_offers'
  | 'crm'
  | 'sold';
export type PropertyAvailability = 'active' | 'draft' | 'sold';
export type OfferState =
  | 'sent'
  | 'interested'
  | 'transferred'
  | 'closed'
  | 'unavailable';
export type OfferReview = 'pending' | 'approved' | 'rejected';

export interface CompanyView {
  id: string;
  kind: 'rf' | 'am';
  name: string;
  contact: string;
}

export interface EmployeeView {
  id: string;
  companyId: string;
  name: string;
  phone: string;
  active: boolean;
}

export interface ClientView {
  id: string;
  publicId: string;
  companyId: string;
  employeeId: string;
  name: string;
  phone: string;
  email: string;
}

export interface RequestView {
  id: string;
  clientId: string;
  stage: RequestStage;
  districts: string[];
  budgetMin: number;
  budgetMax: number;
  areaMin: number;
  areaMax: number;
  rooms: number | null;
  type: string;
  goal: string;
  term: string;
  notes: string;
  market: string;
  repair: string;
  furniture: string;
  parking: string;
  view: string;
  amenities: string[];
  submittedAt: string | null;
  /** Admin's reason for the latest rejection; cleared on resubmit. */
  rejectReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface PropertyView {
  id: string;
  companyId: string;
  availability: PropertyAvailability;
  title: string;
  type: string;
  district: string;
  price: number;
  area: number;
  rooms: number | null;
  floor: number | null;
  floors: number | null;
  ceiling: number | null;
  market: string;
  /** Public landmark; the exact street address stays in `internalAddress`. */
  location: string;
  repair: string;
  furniture: string;
  parking: string;
  bathroom: string;
  balcony: string;
  building: string;
  amenities: string[];
  description: string;
  privateNotes: string;
  internalAddress: string;
  media: string[];
}

export interface OfferView {
  id: string;
  requestId: string;
  propertyId: string;
  companyId: string;
  state: OfferState;
  disposition: 'neutral' | 'rejected';
  closeReason?: 'sold' | 'not_selected';
  matchScore: number;
  review: OfferReview;
  /** Its property is held by another request's active reservation. */
  reservedElsewhere?: boolean;
  /** Admin's reason for the latest rejection; cleared on resubmit. */
  rejectReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface TransferView {
  id: string;
  requestId: string;
  offerIds: string[];
  state: 'demo_transferred' | 'returned' | 'sold';
  soldPropertyId?: string;
  /** Admin's reason for returning it; the broker sees it, partners don't. */
  returnReason: string | null;
  createdAt: string;
}

export interface EventView {
  id: string;
  type:
    | 'offers_sent'
    | 'interest'
    | 'transferred'
    | 'returned'
    | 'sold'
    | 'started'
    | 'request_submitted'
    | 'request_approved'
    | 'request_rejected'
    | 'offer_submitted'
    | 'offer_rejected';
  requestId: string;
  propertyId?: string;
  createdAt: string;
}

export interface WorkspaceState {
  companies: CompanyView[];
  employees: EmployeeView[];
  clients: ClientView[];
  requests: RequestView[];
  properties: PropertyView[];
  offers: OfferView[];
  transfers: TransferView[];
  drafts: Record<string, string[]>;
  events: EventView[];
  readEventIds: string[];
}
