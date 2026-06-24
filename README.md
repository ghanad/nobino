# Nobino Reservations

Internal capacity-based reservation web application for a small company resource pool.

## Product Direction

- Systems are identical and modeled as one configurable resource pool.
- Users request one unit of capacity for an hourly time range.
- Reservations start as `PENDING` and may be approved manually or by configured system auto-approval.
- Only `APPROVED` reservations consume capacity.
- Manager approval is required before a reservation is final.
- Working days and working hours are configurable through weekly schedule rows
  and date-specific exceptions.
- Resource pool capacity has a default value, plus optional Jalali date-specific
  capacity exceptions for repairs or temporary outages.
- All user-facing date input, URLs, and date display use the Persian/Jalali
  calendar. Internal persistence and capacity calculations still use JavaScript
  `Date` values.

Out-of-scope for this project unless explicitly requested: check-in, check-out, no-show handling, penalties, quotas, and physical device assignment.

## Tech Stack

- Next.js App Router
- TypeScript with strict mode
- Tailwind CSS
- shadcn/ui-compatible component setup
- Prisma
- SQLite for local and operational data
- Zod for validation in later phases
- Signed HTTP-only cookie sessions for authentication

## Setup

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Set `AUTH_SECRET` in `.env` to a long random value before using shared or
production environments.

Apply the SQLite database migration and seed defaults:

```bash
npx prisma migrate deploy
npm run prisma:seed
```

Start the development server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Available Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run test
npm run prisma:push
npm run prisma:generate
npm run prisma:seed
```

`npm run test` runs the core business-rule tests against an isolated temporary
SQLite database under `.test-build`; it does not modify the development
database.

## Seeded Data

The seed script creates:

- `admin@nobino.local` / `Admin123!`
- `manager@nobino.local` / `Manager123!`
- `user@nobino.local` / `User123!`
- Resource pool `Company Systems` with capacity `5`
- Weekly schedule using JavaScript `Date.getDay()` values: Sunday through Thursday and Saturday are `09:00-17:00`; Friday is disabled.

## Current Status

The first operational version is implemented. Seeded users can sign in, create hourly reservation requests, see their own reservations grouped by status, cancel pending requests, and accept or reject manager-proposed alternatives. Managers can approve, reject, propose alternatives, and review auto-approval deadlines from `/manager`. Admins can manage resource pool capacity and active state, Jalali date-specific capacity exceptions, weekly working schedule rows, Jalali date-specific schedule exceptions, reservation policy settings, users from `/admin`, and audit history from `/admin/audit`. Users and managers can review unread in-app notifications from `/notifications` and mark notifications as read. Capacity reductions are blocked when future approved reservations would exceed the new effective capacity. Core service rules are covered by automated tests.

## Auth Routes

- `/login` accepts seeded user credentials.
- `/reservations` allows authenticated users to create pending reservation
  requests and review their recent requests.
- `/notifications` allows authenticated users to review unread notification
  events and mark them as read.
- `/settings/bale` allows authenticated users to securely link or unlink their
  private Bale chat.
- `/admin/lunch-notifications` lets admins manage lunch report recipients,
  including direct Bale chat/group IDs and linked Nobino users.
- `/admin/bale` shows admins which users have linked Bale and reports sync and
  delivery health.
- `/manager` is available to managers and admins.
- `/admin` is available to admins only.

## Schedule Rules

Working schedules use JavaScript `Date.getDay()` values: Sunday is `0`,
Monday is `1`, and Friday is `5`.

All user-facing reservation and calendar dates are Jalali dates in
`YYYY-MM-DD` form, for example `1405-02-31`. Persian and Arabic numerals are
accepted in date fields, and `/` can be used instead of `-`. Do not introduce
Gregorian date pickers or Gregorian-formatted dates in product UI.

`lib/schedule.ts` provides:

- `getWorkingWindowForDate(date)` with schedule exception overrides.
- `validateReservationTimeRange({ startAt, endAt })` for exact hourly bounds,
  same-day reservations, minimum 1 hour, maximum one configured working day,
  enabled working days, and working-hour containment.

## Reservation Requests

`lib/reservation-service.ts` provides `createReservationRequest`, which keeps
business rules out of UI code. Pending reservations do not consume capacity and
do not block new requests. Final capacity is checked again during manager
approval, configured system auto-approval, and when a user accepts an
alternative proposal.

## Capacity Exceptions

`ResourcePool.capacity` is the default capacity. Admins can add
`ResourcePoolCapacityException` rows from `/admin` to override capacity for one
Jalali date, for example when one or more systems are unavailable for repair.
The app prevents creating or lowering a daily capacity exception when existing
approved reservations would exceed that day's capacity, so an admin must choose
which approved reservation to cancel before applying the lower capacity.

## Environment Variables

Use `.env.example` as the source of truth for required settings:

- `DATABASE_URL`: SQLite database URL. For local development the default
  `file:./dev.db` creates `prisma/dev.db` because Prisma resolves relative
  SQLite paths from the `prisma/` directory.
- `AUTH_SECRET`: long random secret used to sign HTTP-only session cookies.
  Generate a unique value for every shared or production environment.
- `SESSION_TTL_SECONDS`: signed session lifetime in seconds. The default is
  `604800` seconds, or 7 days.
- `AUTH_PROVIDER`: authentication backend. Use `local` for Nobino passwords,
  `ldap` for company LDAP passwords, or `hybrid` to accept either local or LDAP
  passwords.
- `LDAP_AUTH_METHOD`: LDAP client implementation. Use `node` for the built-in
  Node.js LDAP client path, or `command` to authenticate through
  `ldapsearch`/`ldapwhoami`. The Docker image includes `ldap-utils` for the
  command method.
- `LDAP_URL`: LDAP server URL, for example `ldap://ldap.example.com:389` or
  `ldaps://ldap.example.com:636`. Required when `AUTH_PROVIDER` is `ldap` or
  `hybrid`.
- `LDAP_BASE_DN`: search base used to find users, for example
  `dc=example,dc=com`. Required unless `LDAP_USER_DN_TEMPLATE` is set.
- `LDAP_BIND_DN` and `LDAP_BIND_PASSWORD`: optional service account used for
  user searches. Leave both empty only if anonymous search is allowed or a
  direct `LDAP_USER_DN_TEMPLATE` is used.
- `LDAP_USER_FILTER`: LDAP search filter used to find the login user. It
  supports `{{email}}`, `{{login}}`, and `{{username}}`; the default is
  `(mail={{email}})`. For Active Directory, a common value is
  `(|(mail={{email}})(userPrincipalName={{email}})(sAMAccountName={{username}}))`.
- `LDAP_USER_DN_TEMPLATE`: optional direct bind DN template, for example
  `uid={{username}},ou=People,dc=example,dc=com`. When set, Nobino skips the
  service-account search and binds directly as the user.
- `LDAP_USER_BIND_ATTRIBUTE`: optional attribute used for the user password bind
  after search. For Active Directory this can be `userPrincipalName`, which
  avoids binding with long or non-ASCII distinguished names.
- `LDAP_EMAIL_ATTRIBUTE` and `LDAP_NAME_ATTRIBUTE`: attributes requested during
  LDAP search; defaults are `mail` and `displayName`.
- `LDAP_CONNECT_TIMEOUT_MS` and `LDAP_TIMEOUT_MS`: LDAP connection and operation
  timeouts in milliseconds.
- `LDAP_TLS_REJECT_UNAUTHORIZED`: keep `true` in production so LDAPS
  certificates are verified.
- `APP_TIMEZONE`: operational timezone. Use `Asia/Tehran` unless the company
  explicitly changes scheduling policy.
- `APP_BASE_URL`: externally reachable Nobino base URL, used by deployment
  commands such as the Bale sync request below.
- `BALE_BOT_TOKEN`: secret token received from Bale `@botfather`.
- `BALE_BOT_USERNAME`: bot username without `@`; used by the account-linking UI.
- `BALE_SYNC_SECRET`: long random bearer secret protecting the Bale sync route.
- `AUTO_ACCEPT_CRON_SECRET`: long random bearer secret protecting the reservation auto-accept route.
- `NEXT_PUBLIC_APP_NAME`: display name used by the app shell.

LDAP authentication validates the password against LDAP. When an LDAP login is
successful for an email that does not exist in Nobino yet, Nobino creates an
active `USER` account automatically. Existing disabled/deleted Nobino users stay
blocked even if LDAP accepts their password. Nobino continues to use the local
`role`, `active`, and `canViewLunchReport` fields for authorization and access
control, so manager/admin access still must be assigned in the admin UI.

## External Messaging

The verified bot setup and test-message procedure for Bale are documented in
[`docs/bale-bot.md`](docs/bale-bot.md). Users link their own private chat from
`/settings/bale` using a hashed, single-use, 10-minute connection token.

The protected sync endpoint consumes bot updates, sends pending in-app
notifications to linked users, and also handles the lunch summary delivery.
Invoke the same endpoint once per minute from the deployment scheduler:

```bash
curl --fail --silent --show-error -X POST \
  -H "Authorization: Bearer ${BALE_SYNC_SECRET}" \
  "${APP_BASE_URL}/api/integrations/bale/sync"
```

Run reservation auto-approval once per minute from a separate scheduler entry:

```bash
flock -n /tmp/nobino-auto-accept.lock curl --fail --silent --show-error -X POST \
  -H "Authorization: Bearer ${AUTO_ACCEPT_CRON_SECRET}" \
  "${APP_BASE_URL}/api/internal/reservations/auto-accept"
```

The reservation auto-accept route is independent from the Bale sync route and
only processes eligible pending reservations whose configured auto-approval
deadline has arrived. Existing pending reservations are not backfilled when the
feature is enabled; only new requests and subsequently rescheduled pending
requests receive deadlines.

The endpoint tracks Bale's `update_id` offset, records each notification
delivery, and retries failed sends up to three times. It does not send
notifications that predate the user's latest account connection. Lunch reports
become eligible exactly one minute after the configured lunch cutoff, use the
target date in Jalali form, skip days without lunch service, and still send a
zero-count message for active service days without reservations. If lunch
reservations are disabled in admin settings, no lunch report is sent. Report
recipients are managed by admins from `/admin/lunch-notifications`, and every
active recipient can target either a Bale chat ID or a Nobino user with an
active Bale connection. Every active recipient receives its own delivery
snapshot. User destinations resolve their current Bale connection again on each
retry. Run only one sync invocation at a time to
avoid overlapping external requests.

External collaborators do not need a Nobino account. They open the bot in Bale,
send `/chatid` in a private chat, copy the private chat ID shown by the bot, and
send that value to an admin. The admin then registers the ID in
`/admin/lunch-notifications`.

Lunch report rows are stored separately from user-notification deliveries so
only one report can be claimed per date. The Bale API does not expose an
idempotency key, so an ambiguous network failure can still produce a duplicate
report on retry even though Nobino preserves and retries the same stored
message snapshot.

Admins can monitor the last successful or failed sync, recent delivery errors,
and user connection coverage from `/admin/bale`. A sync older than five minutes
is shown as stale because the deployment scheduler is expected to run once per
minute.

## Production Deployment

The project includes a production Docker image and a compose file. Runtime
startup runs `prisma migrate deploy`, so a newly mounted SQLite database is
created and migrated before the app starts.

Build locally:

```bash
docker build -t ghanad/nobino:latest .
```

Run with compose:

```bash
mkdir -p data
AUTH_SECRET="replace-with-a-long-random-secret" \
docker compose up -d
```

To enable LDAP in compose, pass the company settings as environment variables:

```bash
AUTH_SECRET="replace-with-a-long-random-secret" \
AUTH_PROVIDER="hybrid" \
LDAP_URL="ldaps://ldap.example.com:636" \
LDAP_BASE_DN="dc=example,dc=com" \
LDAP_BIND_DN="cn=nobino,ou=Service Accounts,dc=example,dc=com" \
LDAP_BIND_PASSWORD="replace-with-service-account-password" \
LDAP_USER_FILTER="(|(mail={{email}})(userPrincipalName={{email}})(sAMAccountName={{username}}))" \
docker compose up -d
```

For a fresh database, create the initial demo/admin records once:

```bash
docker compose exec nobino npm run prisma:seed
```

The compose file uses format version `2.2` so it remains compatible with older
`docker-compose` installations such as `1.25.0`. It mounts `./data` to `/data`
inside the container and uses `DATABASE_URL=file:/data/nobino.sqlite`, so the
SQLite database stays outside the container image. Back up this mounted
directory.
`AUTH_SECRET` must be set before starting compose; the production app refuses
to start without it.

The default compose file sets `SESSION_COOKIE_SECURE=false` so login works when
the app is served directly over plain HTTP during initial deployment. When the
app is placed behind HTTPS, remove that line or set it to `true` so session
cookies are marked secure.
Sessions last 7 days by default. Set `SESSION_TTL_SECONDS` to a different
number of seconds if the organization needs a shorter or longer login lifetime.

For GitHub Actions to publish to Docker Hub on every push to `main`, configure
these repository secrets:

- `DOCKERHUB_USERNAME`: Docker Hub username.
- `DOCKERHUB_TOKEN`: Docker Hub access token.

The workflow always publishes to `ghanad/nobino` with `latest` and
`main-<git-sha>` tags. Set
`NODE_ENV=production`, provide a strong `AUTH_SECRET`, and do not deploy with
the seeded demo passwords in a real environment; create operational admin and
manager accounts, then replace or deactivate seed users.

## SQLite Backup And Recovery

SQLite stores operational state in one database file plus a possible journal or
WAL sidecar depending on runtime mode. For the default local URL, back up:

- `prisma/dev.db`
- `prisma/dev.db-journal`, if present
- `prisma/dev.db-wal` and `prisma/dev.db-shm`, if present

For production, schedule file-level backups while the app is stopped or use
SQLite's online backup tooling from the hosting platform. Test restoration into
a separate environment before relying on backups operationally.

## Timezone Notes

Reservation boundaries are stored as JavaScript/Prisma `DateTime` values, while
all user-facing date input and display use Jalali dates. Run the Node process
with `TZ=Asia/Tehran` and keep `APP_TIMEZONE=Asia/Tehran` so local working-day
checks, hourly boundaries, and Jalali URL dates are interpreted consistently.

## Security Checklist

- Passwords are hashed with `scrypt` before storage.
- Session cookies are HTTP-only, signed with `AUTH_SECRET`, expire after the
  configured `SESSION_TTL_SECONDS`, and are marked secure in production.
- Protected routes use server-side role checks for user, manager, and admin
  access.
- Mutations validate form input with Zod and enforce business rules in service
  functions, not UI components.
- Approval and alternative acceptance re-check capacity inside backend
  transactions before changing reservation status.
- Keep `.env` and SQLite database files out of git and restrict file
  permissions on production hosts.
