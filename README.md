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
- SQLite for the local and first operational database
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

Initialize the SQLite database:

```bash
touch dev.db
npx prisma db push
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
```

## Phase Status

Phase 0 is a project bootstrap only. Core database models, seed data, authentication, scheduling logic, reservation creation, capacity checks, and manager approval flows are intentionally left for later phases.
