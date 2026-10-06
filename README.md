# nectar-be

Backend for Nectar Estate, built with [NestJS](https://nestjs.com), PostgreSQL and
[Drizzle ORM](https://orm.drizzle.team). It serves the
[`nectar-fe`](../nectar-fe) frontend. The full picture (data model, visibility rules,
state machines, every endpoint) is in [`PROJECT_OVERVIEW.md`](../PROJECT_OVERVIEW.md).

## Roles

| Role      | Who                             | Home in the UI       |
| --------- | ------------------------------- | -------------------- |
| `broker`  | Russian broker (RF company)     | `/broker/workspace`  |
| `partner` | Armenian broker (AM company)    | `/partner/requests`  |
| `admin`   | Nectar administrator            | `/admin/overview`    |

Brokers and partners apply through sign-up; an admin approves the application, which
creates their company and account.

## Deal flow

Every step that crosses from one side to the other goes through an admin:

1. **Broker** adds a client, creates a request and submits it (`created → pending_review`).
2. **Admin approval #1** — approve (partners can now see it) or reject with a reason; the
   broker edits and resubmits.
3. **Partner** sends properties as offers (`review = pending`).
4. **Admin approval #2** — approve (the broker can now see it) or decline with a reason;
   the partner fixes the property and resubmits.
5. **Broker** books the offers that fit and **reserves** them. A property can be in only
   one active reservation. Editing the request instead sends it back to step 2.
6. **Admin final review** — confirm the sale of one reserved property (`sold`) or return
   the reservation to work with a reason.

Partners never see unapproved requests; brokers never see unapproved offers or Armenian
properties outside approved offers. A partner's change to a property sends its live
offers back to review. Each review decision emits a notification to the roles allowed to
see it.

## Setup

```bash
brew install postgresql@17 && brew services start postgresql@17
createdb nectar

pnpm install
cp .env.example .env   # then set DATABASE_URL and a random JWT_SECRET (32+ chars)
pnpm db:migrate
```

The database starts empty: sign up a broker, a partner and an admin from the UI.

## Run

```bash
pnpm start:dev    # watch mode, http://localhost:4000/api
pnpm build && pnpm start:prod
```

The frontend calls `VITE_API_URL` (`http://localhost:4000/api`) directly. Property
photos are uploaded to Cloudinary (`CLOUDINARY_URL`, folder `CLOUDINARY_FOLDER`); only
Cloudinary delivery URLs are accepted as property media.

## API

All routes are under `/api`. Sign-in and sign-up set the JWT in an httpOnly
`nectar_session` cookie (`SameSite=Lax`, `Path=/api`, `Secure` when
`NODE_ENV=production`); every non-public route requires it. Browser clients must send
requests with credentials, and their origin must be listed in `CORS_ORIGIN`.

Reads are role-scoped, paginated lists (`/bootstrap`, `/requests`, `/offers/table`,
`/properties`, `/notifications`, …) that return the related records they need; see
`PROJECT_OVERVIEW.md` §8 for parameters. Workflow and record writes return `{ ok: true }`:

| Method | Path                                      | Role    |
| ------ | ----------------------------------------- | ------- |
| GET    | `/health`                                 | public  |
| POST   | `/auth/sign-up`, `/auth/sign-in`          | public  |
| POST   | `/auth/sign-out` (clears the cookie)      | public  |
| GET    | `/auth/me`                                | any     |
| POST   | `/requests/:id/submit`                    | broker  |
| POST   | `/requests/:id/approve`, `/requests/:id/reject` `{ reason }` | admin |
| POST   | `/requests/:id/drafts/:propertyId/toggle` | partner |
| POST   | `/requests/:id/offers`                    | partner |
| POST   | `/offers/:id/approve`, `/offers/:id/decline` `{ reason }` | admin |
| POST   | `/offers/:id/resubmit`                    | partner |
| POST   | `/offers/:id/interest`                    | broker  |
| POST   | `/offers/:id/reject`, `/offers/:id/restore` (broker's "not a fit") | broker |
| POST   | `/requests/:id/transfer` (reserve)        | broker  |
| POST   | `/transfers/:id/sell` `{ propertyId }`    | admin   |
| POST   | `/transfers/:id/return` `{ reason }`      | admin   |
| POST   | `/events/:id/read`, `/events/read-all`    | any     |
| POST   | `/clients`                                | broker, admin |
| PATCH  | `/clients/:id`                            | broker, admin |
| POST   | `/clients/:id/requests`                   | broker, admin |
| PATCH  | `/requests/:id`                           | broker, admin |
| POST   | `/properties`                             | partner |
| PATCH  | `/properties/:id`                         | partner, admin |
| POST   | `/uploads` (multipart `file`, image ≤ 8 MB) | partner |
| POST   | `/companies`                              | admin   |
| PATCH  | `/companies/:id`                          | own company, admin |
| POST   | `/companies/:id/employees`                | own company, admin |
| PATCH  | `/employees/:id`                          | own company, admin |

Partners see anonymised clients, and brokers don't see partners' private notes or
internal addresses.

## Database

```bash
pnpm db:generate   # create a migration after editing src/database/schema.ts
pnpm db:migrate
pnpm db:studio
```

## Test & lint

```bash
pnpm test          # needs DATABASE_URL (see below)
pnpm test:e2e
pnpm lint
pnpm format
```

Both specs are skipped without `DATABASE_URL`:

- `workflow.service.spec.ts` creates and drops its own throwaway database on that server,
  so it needs permission to `CREATE DATABASE` but never touches your data.
- `lists.service.spec.ts` checks role scoping against `pnpm db:seed` data.
