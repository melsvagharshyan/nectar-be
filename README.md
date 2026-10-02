# nectar-be

Backend for Nectar Estate, built with [NestJS](https://nestjs.com), PostgreSQL and
[Drizzle ORM](https://orm.drizzle.team). It serves the
[`nectar-estate-ui`](../nectar-estate-ui) frontend.

## Roles

| Role      | Who                             | Home in the UI       |
| --------- | ------------------------------- | -------------------- |
| `broker`  | Russian broker (RF company)     | `#/broker/workspace` |
| `partner` | Armenian broker (AM company)    | `#/partner/requests` |
| `admin`   | Nectar administrator            | `#/admin/overview`   |

Brokers and partners create their own company on sign-up. Admin sign-up requires
`ADMIN_SIGNUP_CODE`.

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

| Method | Path                                      | Role    |
| ------ | ----------------------------------------- | ------- |
| GET    | `/health`                                 | public  |
| POST   | `/auth/sign-up`, `/auth/sign-in`          | public  |
| POST   | `/auth/sign-out` (clears the cookie)      | public  |
| GET    | `/auth/me`                                | any     |
| GET    | `/workspace`                              | any     |
| POST   | `/requests/:id/start`                     | broker  |
| POST   | `/requests/:id/transfer`                  | broker  |
| POST   | `/offers/:id/interest`                    | broker  |
| POST   | `/offers/:id/reject`, `/offers/:id/restore` | broker |
| POST   | `/requests/:id/drafts/:propertyId/toggle` | partner |
| POST   | `/requests/:id/offers`                    | partner |
| POST   | `/transfers/:id/return`                   | admin   |
| POST   | `/transfers/:id/sell`                     | admin   |
| POST   | `/events/:id/read`                        | any     |
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

`GET /workspace` returns a role-scoped snapshot: partners see anonymised clients, and
brokers don't see partners' private notes or internal addresses. Every workflow
action returns the refreshed snapshot.

## Database

```bash
pnpm db:generate   # create a migration after editing src/database/schema.ts
pnpm db:migrate
pnpm db:studio
```

## Test & lint

```bash
pnpm test
pnpm test:e2e
pnpm lint
pnpm format
```
