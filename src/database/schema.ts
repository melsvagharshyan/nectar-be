import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', ['broker', 'partner', 'admin']);
export const companyKind = pgEnum('company_kind', ['rf', 'am']);
export const registrationStatus = pgEnum('registration_status', [
  'pending',
  'approved',
  'rejected',
]);
export const requestStage = pgEnum('request_stage', [
  'created',
  'pending_review',
  'rejected',
  'in_progress',
  'has_offers',
  'crm',
  'sold',
]);
export const propertyAvailability = pgEnum('property_availability', [
  'active',
  'draft',
  'sold',
]);
export const offerState = pgEnum('offer_state', [
  'sent',
  'interested',
  'transferred',
  'closed',
  'unavailable',
]);
export const offerDisposition = pgEnum('offer_disposition', [
  'neutral',
  'rejected',
]);
export const offerReview = pgEnum('offer_review', [
  'pending',
  'approved',
  'rejected',
]);
export const offerCloseReason = pgEnum('offer_close_reason', [
  'sold',
  'not_selected',
]);
export const transferState = pgEnum('transfer_state', [
  'demo_transferred',
  'returned',
  'sold',
]);
export const eventType = pgEnum('event_type', [
  'offers_sent',
  'interest',
  'transferred',
  'returned',
  'sold',
  'started',
  'request_submitted',
  'request_approved',
  'request_rejected',
  'offer_submitted',
  'offer_rejected',
]);

// Seeded demo records use low numbers; generated ids start above them.
export const companyIdSeq = pgSequence('company_id_seq', { startWith: 100 });
export const clientIdSeq = pgSequence('client_id_seq', { startWith: 1000 });
export const requestIdSeq = pgSequence('request_id_seq', { startWith: 5000 });
export const propertyIdSeq = pgSequence('property_id_seq', { startWith: 10000 });
export const offerIdSeq = pgSequence('offer_id_seq', { startWith: 1000 });
export const transferIdSeq = pgSequence('transfer_id_seq', { startWith: 100 });
export const eventIdSeq = pgSequence('event_id_seq', { startWith: 1000 });

const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const companies = pgTable('companies', {
  id: text('id').primaryKey(),
  kind: companyKind('kind').notNull(),
  name: text('name').notNull(),
  contact: text('contact').notNull().default(''),
  createdAt: createdAt(),
});

export const employees = pgTable(
  'employees',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    phone: text('phone').notNull().default(''),
    active: boolean('active').notNull().default(true),
  },
  (t) => [index('employees_company_idx').on(t.companyId)],
);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRole('role').notNull(),
  name: text('name').notNull(),
  phone: text('phone').notNull().default(''),
  avatarUrl: text('avatar_url'),
  companyId: text('company_id').references(() => companies.id, {
    onDelete: 'restrict',
  }),
  employeeId: text('employee_id').references(() => employees.id, {
    onDelete: 'set null',
  }),
  /** Set when an admin deactivates the account; null = active. */
  blockedAt: timestamp('blocked_at', { withTimezone: true }),
  blockedBy: uuid('blocked_by').references((): AnyPgColumn => users.id, {
    onDelete: 'set null',
  }),
  blockReason: text('block_reason'),
  createdAt: createdAt(),
});

/** Self-service sign-ups waiting for an admin; accounts are created on approval. */
export const registrationRequests = pgTable(
  'registration_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Only the two broker roles can apply; admins are provisioned separately.
    role: userRole('role').notNull(),
    status: registrationStatus('status').notNull().default('pending'),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    phone: text('phone').notNull().default(''),
    companyName: text('company_name').notNull(),
    rejectReason: text('reject_reason'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    // Filled on approval: the account and company that were created.
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    companyId: text('company_id').references(() => companies.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
  },
  (t) => [
    check('registration_requests_role_check', sql`${t.role} <> 'admin'`),
    // At most one open application per email.
    uniqueIndex('registration_requests_pending_email_uq')
      .on(t.email)
      .where(sql`${t.status} = 'pending'`),
    index('registration_requests_status_created_idx').on(
      t.status,
      t.createdAt,
      t.id,
    ),
  ],
);

export const clients = pgTable(
  'clients',
  {
    id: text('id').primaryKey(),
    publicId: text('public_id').notNull().unique(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id),
    name: text('name').notNull(),
    phone: text('phone').notNull().default(''),
    email: text('email').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [index('clients_company_created_idx').on(t.companyId, t.createdAt, t.id)],
);

export const requests = pgTable(
  'requests',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    stage: requestStage('stage').notNull().default('created'),
    districts: text('districts').array().notNull().default([]),
    budgetMin: integer('budget_min').notNull().default(0),
    budgetMax: integer('budget_max').notNull().default(0),
    areaMin: doublePrecision('area_min').notNull().default(0),
    areaMax: doublePrecision('area_max').notNull().default(0),
    rooms: integer('rooms'),
    type: text('type').notNull(),
    goal: text('goal').notNull().default(''),
    term: text('term').notNull().default(''),
    notes: text('notes').notNull().default(''),
    market: text('market').notNull().default(''),
    repair: text('repair').notNull().default(''),
    furniture: text('furniture').notNull().default(''),
    parking: text('parking').notNull().default(''),
    view: text('view').notNull().default(''),
    amenities: text('amenities').array().notNull().default([]),
    // Admin review: partners only see a request once an admin approves it.
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    rejectReason: text('reject_reason'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('requests_client_idx').on(t.clientId),
    index('requests_stage_idx').on(t.stage),
    index('requests_created_idx').on(t.createdAt, t.id),
    index('requests_districts_gin').using('gin', t.districts),
  ],
);

export const properties = pgTable(
  'properties',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    availability: propertyAvailability('availability')
      .notNull()
      .default('draft'),
    title: text('title').notNull(),
    type: text('type').notNull(),
    district: text('district').notNull(),
    price: integer('price').notNull(),
    area: doublePrecision('area').notNull(),
    rooms: integer('rooms'),
    floor: integer('floor'),
    floors: integer('floors'),
    ceiling: doublePrecision('ceiling'),
    market: text('market').notNull().default(''),
    location: text('location').notNull().default(''),
    repair: text('repair').notNull().default(''),
    furniture: text('furniture').notNull().default(''),
    parking: text('parking').notNull().default(''),
    bathroom: text('bathroom').notNull().default(''),
    balcony: text('balcony').notNull().default(''),
    building: text('building').notNull().default(''),
    amenities: text('amenities').array().notNull().default([]),
    description: text('description').notNull().default(''),
    privateNotes: text('private_notes').notNull().default(''),
    internalAddress: text('internal_address').notNull().default(''),
    media: text('media').array().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [
    index('properties_company_idx').on(t.companyId),
    index('properties_availability_company_idx').on(t.availability, t.companyId),
    index('properties_district_idx').on(t.district),
    index('properties_price_idx').on(t.price),
    index('properties_created_idx').on(t.createdAt, t.id),
  ],
);

export const offers = pgTable(
  'offers',
  {
    id: text('id').primaryKey(),
    requestId: text('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    propertyId: text('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    state: offerState('state').notNull().default('sent'),
    disposition: offerDisposition('disposition').notNull().default('neutral'),
    closeReason: offerCloseReason('close_reason'),
    matchScore: integer('match_score').notNull().default(0),
    // Admin review: brokers only see approved offers.
    review: offerReview('review').notNull().default('pending'),
    rejectReason: text('reject_reason'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('offers_review_idx').on(t.review, t.createdAt),
    unique('offers_request_property_uq').on(t.requestId, t.propertyId),
    index('offers_property_idx').on(t.propertyId),
    index('offers_company_idx').on(t.companyId, t.requestId),
  ],
);

export const transfers = pgTable(
  'transfers',
  {
    id: text('id').primaryKey(),
    requestId: text('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    offerIds: text('offer_ids').array().notNull(),
    state: transferState('state').notNull().default('demo_transferred'),
    soldPropertyId: text('sold_property_id').references(() => properties.id, {
      onDelete: 'set null',
    }),
    /** Admin's reason for returning the reservation; shown to the broker. */
    returnReason: text('return_reason'),
    createdAt: createdAt(),
  },
  (t) => [index('transfers_request_idx').on(t.requestId)],
);

export const events = pgTable(
  'events',
  {
    id: text('id').primaryKey(),
    type: eventType('type').notNull(),
    requestId: text('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    propertyId: text('property_id').references(() => properties.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
  },
  (t) => [
    index('events_request_idx').on(t.requestId),
    index('events_created_idx').on(t.createdAt, t.id),
  ],
);

export const drafts = pgTable(
  'drafts',
  {
    requestId: text('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    propertyId: text('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.requestId, t.propertyId] }),
    index('drafts_company_idx').on(t.companyId),
  ],
);

export const eventReads = pgTable(
  'event_reads',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.eventId] })],
);
