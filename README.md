# Nobino Reservations

Internal capacity-based reservation web application for a small company resource pool.

## Product Direction

- Systems are identical and modeled as one configurable resource pool.
- Users request one unit of capacity for an hourly time range.
- Reservations start as `PENDING`.
- Only `APPROVED` reservations consume capacity.
- Manager approval is required before a reservation is final.
- Working days and working hours are configurable in later phases.

Out-of-scope for this project unless explicitly requested: check-in, check-out, no-show handling, penalties, quotas, and physical device assignment.

## Tech Stack

- Next.js App Router
- TypeScript with strict mode
- Tailwind CSS
- shadcn/ui-compatible component setup
- Prisma
- PostgreSQL for local and operational data
- Zod for validation in later phases

## Setup

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Start PostgreSQL:

```bash
docker compose up -d
```

Apply the database migration and seed defaults:

```bash
npx prisma migrate dev
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

Phase 1 is complete: the core Prisma data model, PostgreSQL migration, seed users, resource pool, weekly schedule, and notification table are in place. Authentication, scheduling services, reservation creation, capacity checks, and manager approval flows are intentionally left for later phases.
