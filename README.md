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
npm run prisma:push
npm run prisma:generate
npm run prisma:seed
```

## Seeded Data

The seed script creates:

- `admin@nobino.local` / `Admin123!`
- `manager@nobino.local` / `Manager123!`
- `user@nobino.local` / `User123!`
- Resource pool `Company Systems` with capacity `5`
- Weekly schedule using JavaScript `Date.getDay()` values: Sunday through Thursday and Saturday are `09:00-17:00`; Friday is disabled.

## Phase Status

Phase 10 is complete: seeded users can sign in, create hourly reservation requests, see their own reservations grouped by status, cancel pending requests, and accept or reject manager-proposed alternatives. Managers can approve, reject, and propose alternatives from `/manager`. Admins can manage resource pool capacity and active state, weekly working schedule rows, Jalali date-specific schedule exceptions, and users from `/admin`. Users and managers can review unread in-app notifications from `/notifications` and mark notifications as read. Capacity reductions are blocked when future approved reservations would exceed the new capacity.

## Auth Routes

- `/login` accepts seeded user credentials.
- `/dashboard` is available to all authenticated active users.
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
