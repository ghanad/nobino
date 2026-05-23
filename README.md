# Nobino Reservations

Internal capacity-based reservation web application for a small company resource pool.

## Product Direction

- Systems are identical and modeled as one configurable resource pool.
- Users request one unit of capacity for an hourly time range.
- Reservations start as `PENDING`.
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

The first operational version is implemented. Seeded users can sign in, create hourly reservation requests, see their own reservations grouped by status, cancel pending requests, and accept or reject manager-proposed alternatives. Managers can approve, reject, and propose alternatives from `/manager`. Admins can manage resource pool capacity and active state, Jalali date-specific capacity exceptions, weekly working schedule rows, Jalali date-specific schedule exceptions, users from `/admin`, and audit history from `/admin/audit`. Users and managers can review unread in-app notifications from `/notifications` and mark notifications as read. Capacity reductions are blocked when future approved reservations would exceed the new effective capacity. Core service rules are covered by automated tests.

## Auth Routes

- `/login` accepts seeded user credentials.
- `/reservations` allows authenticated users to create pending reservation
  requests and review their recent requests.
- `/notifications` allows authenticated users to review unread notification
  events and mark them as read.
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
business rules out of UI code. Pending reservations do not consume capacity.
For the first operational version, request creation rejects ranges where
approved reservations already fill any requested hour; final capacity is checked
again during manager approval and when a user accepts an alternative proposal.

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
- `APP_TIMEZONE`: operational timezone. Use `Asia/Tehran` unless the company
  explicitly changes scheduling policy.
- `NEXT_PUBLIC_APP_NAME`: display name used by the app shell.

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

The compose file mounts `${NOBINO_DATA_DIR:-./data}` to `/data` inside the
container and uses `DATABASE_URL=file:/data/nobino.sqlite`, so the SQLite
database stays outside the container image. Back up this mounted directory.

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
- Session cookies are HTTP-only, signed with `AUTH_SECRET`, and marked secure in
  production.
- Protected routes use server-side role checks for user, manager, and admin
  access.
- Mutations validate form input with Zod and enforce business rules in service
  functions, not UI components.
- Approval and alternative acceptance re-check capacity inside backend
  transactions before changing reservation status.
- Keep `.env` and SQLite database files out of git and restrict file
  permissions on production hosts.
