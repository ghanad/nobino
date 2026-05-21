# System Reservation Web Application — Project Brief

## Purpose

Build a small internal web application for reserving a limited number of identical company systems.

The company has a small number of systems, usually 5 or 6. Around 50 users may use the application. This is not a large-scale SaaS product. Keep the implementation simple, reliable, and fast to ship.

## Core business model

This is a **capacity-based booking system**, not a device-selection system.

Users do not choose "System 1", "System 2", etc.

They choose:

> I need one system on this date, from this hour to this hour.

The application checks the active capacity of the resource pool.

Example:

- Active capacity: 5 systems
- Approved reservations for 10:00–11:00: 3
- Pending reservations for 10:00–11:00: 4
- Remaining confirmed capacity: 2

Only approved reservations consume capacity. Pending reservations are visible but do not block the slot.

## Main rules

### Reservation approval

A reservation is final only after manager approval.

Before approval, the request is only `PENDING`.

Multiple users may request the same time slot while requests are pending.

### Capacity behavior

- `APPROVED` reservations consume capacity.
- `PENDING` reservations do not consume capacity.
- When a manager tries to approve a request, the backend must check capacity again.
- If capacity is full for any hour inside the requested range, approval must fail.

### Time granularity

Reservations use one-hour blocks.

Valid examples:

- 09:00–10:00
- 10:00–12:00
- 09:00–17:00

Invalid examples:

- 09:30–10:30
- 10:15–12:00
- Monday 09:00 to Tuesday 12:00

### Reservation length

- Minimum: 1 hour
- Maximum: one working day
- A reservation cannot span multiple calendar days.
- If a user needs two days, they must create two separate reservations.

### Working hours

Working days and working hours must be configurable.

Default can be:

- Saturday: 09:00–17:00
- Sunday: 09:00–17:00
- Monday: 09:00–17:00
- Tuesday: 09:00–17:00
- Wednesday: 09:00–17:00
- Thursday: 09:00–17:00
- Friday: disabled by default, but configurable

Special date exceptions must be supported.

Examples:

- A specific Friday can be enabled.
- A normal working day can be disabled for maintenance.
- A specific day can have custom hours such as 10:00–15:00.

### Reservation reason

The reservation reason is optional in the first operational version.

Keep the database field from the beginning, but do not require it in validation yet.

### Not included

Do not implement these unless explicitly asked later:

- Check-in
- Check-out
- No-show tracking
- Penalties
- User quotas
- Automatic priority scoring
- Selecting a specific physical system

## Roles

### USER

Can:

- Sign in
- View the booking calendar
- Create reservation requests
- View own reservations
- Cancel own pending requests
- Accept or reject alternative times proposed by managers

### MANAGER

Can:

- View all reservations
- Approve pending requests
- Reject pending requests
- Propose alternative time slots
- Cancel approved reservations if needed
- See requester names and details
- Receive notifications for new pending requests

### ADMIN

Can do everything a manager can do, plus:

- Manage users
- Manage active capacity
- Configure working days and working hours
- Configure special schedule exceptions

For the first version, ADMIN and MANAGER can be implemented separately, but it is acceptable if ADMIN has all permissions.

## Recommended stack

Use a simple, modern, LLM-friendly full-stack setup:

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Prisma ORM
- SQLite
- Auth.js / NextAuth Credentials provider or a simple secure session implementation
- Zod for validation

Reasoning:

- Small user base
- Need fast implementation
- Need transactional capacity checks
- SQLite keeps local setup simple while still supporting transactional approval checks for this small app
- Next.js keeps frontend and backend in one repo

## Deployment assumptions

Keep deployment simple.

Suggested first deployment:

- One web app container
- One SQLite database file on persistent storage
- Environment variables
- Seeded admin user
- Internal company network or VPN access

## Key UX screens

### Login

Simple email/password login.

### Calendar / Booking view

User sees a daily or weekly calendar.

For each hour slot show:

- Approved count
- Pending count
- Remaining confirmed capacity

Example:

> 10:00–11:00  
> Approved: 3 / 5  
> Pending: 2  
> Available confirmed capacity: 2

Pending should be visually lighter than approved.

### Create reservation

Fields:

- Date
- Start hour
- End hour
- Optional reason

### My reservations

User sees:

- Pending requests
- Approved reservations
- Rejected requests
- Alternative proposals

### Manager queue

Manager sees pending requests and can:

- Approve
- Reject with optional reason
- Propose alternative time

### Admin settings

Admin can manage:

- Capacity
- Weekly working schedule
- Date exceptions
- Users

## Critical backend behavior

Do not rely only on frontend checks.

The backend must enforce:

- User is authenticated
- User has required role
- Start/end time are valid hourly boundaries
- Reservation is within a single day
- Reservation is within working hours
- Reservation status transitions are valid
- Capacity is checked inside a database transaction when approving
- Audit logs are created for important changes

## Status model

Reservation statuses:

- `PENDING`
- `APPROVED`
- `REJECTED`
- `CANCELLED_BY_USER`
- `CANCELLED_BY_ADMIN`
- `ALTERNATIVE_PROPOSED`

Alternative statuses:

- `PROPOSED`
- `ACCEPTED`
- `REJECTED`
- `EXPIRED`

## Capacity approval example

Capacity: 5

Reservation request:

- Monday 09:00–12:00

The backend must check each hourly slot:

- 09:00–10:00
- 10:00–11:00
- 11:00–12:00

If any slot already has 5 approved reservations, approval must fail.

## Important product decision

When a pending request is created, do not block the slot.

When a manager approves it, check capacity at that exact moment.

This is the core rule of the system.
