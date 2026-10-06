import { sql, type AnyColumn, type SQL } from 'drizzle-orm';
import type { AuthUser } from '../auth/auth.types.js';
import * as t from '../database/schema.js';

/**
 * Role visibility rules from `rules.ts`, expressed as SQL so lists can be
 * filtered and paginated in the database. `undefined` means "no restriction".
 */

const OPEN_STAGES = sql`('in_progress', 'has_offers')`;
const CLOSED_STAGES = sql`('crm', 'sold')`;
const UNAPPROVED_STAGES = sql`('created', 'pending_review', 'rejected')`;
// Mirror REQUEST_REVIEW_EVENTS / OFFER_REVIEW_EVENTS in rules.ts.
const REQUEST_REVIEW_EVENTS = sql`('request_submitted', 'request_approved', 'request_rejected')`;
const OFFER_REVIEW_EVENTS = sql`('offer_submitted', 'offer_rejected')`;
export const SELECTED_STATES = sql`('interested', 'transferred')`;

const ownOfferOn = (requestId: AnyColumn, companyId: string) =>
  sql`exists (select 1 from ${t.offers} o where o.request_id = ${requestId} and o.company_id = ${companyId})`;

const brokerOwns = (requestId: AnyColumn, companyId: string) =>
  sql`exists (select 1 from ${t.requests} r join ${t.clients} c on c.id = r.client_id where r.id = ${requestId} and c.company_id = ${companyId})`;

/** Applies to queries whose FROM is `requests`. */
export function requestScope(user: AuthUser): SQL | undefined {
  if (user.role === 'admin') return undefined;
  const company = user.companyId ?? '';
  if (user.role === 'broker')
    return sql`exists (select 1 from ${t.clients} c where c.id = ${t.requests.clientId} and c.company_id = ${company})`;
  return sql`(${t.requests.stage} in ${OPEN_STAGES} or (${t.requests.stage} in ${CLOSED_STAGES} and ${ownOfferOn(t.requests.id, company)}))`;
}

/** Applies to queries whose FROM is `events`. */
export function eventScope(user: AuthUser): SQL | undefined {
  if (user.role === 'admin') return undefined;
  const company = user.companyId ?? '';
  if (user.role === 'broker')
    return sql`(${t.events.type} not in ${OFFER_REVIEW_EVENTS} and ${brokerOwns(t.events.requestId, company)})`;
  return sql`((${t.events.type} = 'started' and exists (select 1 from ${t.requests} r where r.id = ${t.events.requestId} and r.stage in ${OPEN_STAGES}))
    or (${t.events.type} <> 'started' and ${t.events.type} not in ${REQUEST_REVIEW_EVENTS} and exists (select 1 from ${t.offers} o where o.request_id = ${t.events.requestId} and o.company_id = ${company}
      and (${t.events.propertyId} is null or o.property_id = ${t.events.propertyId}))
      and exists (select 1 from ${t.requests} r where r.id = ${t.events.requestId} and r.stage not in ${UNAPPROVED_STAGES})))`;
}

/** Applies to queries whose FROM is `properties`. */
export function propertyScope(user: AuthUser): SQL | undefined {
  if (user.role === 'admin') return undefined;
  const company = user.companyId ?? '';
  if (user.role === 'partner') return sql`${t.properties.companyId} = ${company}`;
  // Brokers only see properties an admin approved as offers on their requests.
  return sql`exists (
    select 1 from ${t.offers} o join ${t.requests} r on r.id = o.request_id join ${t.clients} c on c.id = r.client_id
    where o.property_id = ${t.properties.id} and o.review = 'approved' and c.company_id = ${company})`;
}

/** Applies to queries whose FROM is `offers`. */
export function offerScope(user: AuthUser): SQL | undefined {
  if (user.role === 'admin') return undefined;
  const company = user.companyId ?? '';
  if (user.role === 'partner') return sql`${t.offers.companyId} = ${company}`;
  return sql`(${t.offers.review} = 'approved' and ${brokerOwns(t.offers.requestId, company)})`;
}

/** In-progress requests older than a day that still have no available offer. */
export const attentionSql = sql`(${t.requests.stage} = 'in_progress'
  and ${t.requests.createdAt} < now() - interval '24 hours'
  and not exists (
    select 1 from ${t.offers} o join ${t.properties} p on p.id = o.property_id
    where o.request_id = ${t.requests.id} and o.review = 'approved'
      and o.state not in ('closed', 'unavailable') and p.availability = 'active'))`;

/** Stage filter used by the workspace: a stage name or the special `attention`. */
export const stageSql = (stage: string | undefined) =>
  !stage
    ? undefined
    : stage === 'attention'
      ? attentionSql
      : sql`${t.requests.stage} = ${stage}`;

export const ownOfferSql = (companyId: string) =>
  ownOfferOn(t.requests.id, companyId);

export const openStageSql = sql`${t.requests.stage} in ${OPEN_STAGES}`;
