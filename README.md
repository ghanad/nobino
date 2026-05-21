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

Phase 4 is complete: seeded users can sign in, create hourly reservation requests, and see their recent requests. New reservations are stored as `PENDING`, create audit logs, and notify active managers/admins in the notification table. Server-side validation enforces the configured schedule and time rules, and request creation is blocked only when already-approved reservations fill capacity for any requested hour.

Calendar views and manager approval flows are intentionally left for later phases.

## Auth Routes

- `/login` accepts seeded user credentials.
- `/dashboard` is available to all authenticated active users.
- `/reservations` allows authenticated users to create pending reservation
  requests and review their recent requests.
- `/manager` is available to managers and admins.
- `/admin` is available to admins only.

## Schedule Rules

Working schedules use JavaScript `Date.getDay()` values: Sunday is `0`,
Monday is `1`, and Friday is `5`.

`lib/schedule.ts` provides:

- `getWorkingWindowForDate(date)` with schedule exception overrides.
- `validateReservationTimeRange({ startAt, endAt })` for exact hourly bounds,
  same-day reservations, minimum 1 hour, maximum one configured working day,
  enabled working days, and working-hour containment.

## Reservation Requests

`lib/reservation-service.ts` provides `createReservationRequest`, which keeps
business rules out of UI code. Pending reservations do not consume capacity.
For the first operational version, request creation rejects ranges where
approved reservations already fill any requested hour; final capacity is still
expected to be checked again during manager approval in a later phase.
