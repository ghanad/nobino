# AGENTS.md

## Project

Internal System Reservation Web Application

## Objective

Build a small internal capacity-based reservation web app for a company with around 5–6 identical systems and around 50 users.

This is not a large enterprise product. Prefer simple, maintainable, production-usable implementation over over-engineering.

## Product model

All systems are identical.

Do not model user-facing booking as "choose physical device number 1/2/3".

Model it as a resource pool with a configurable capacity.

Example:

```text
ResourcePool:
  name: "Company Systems"
  capacity: 5
```

A user reserves one unit of capacity for a time range.

Only `APPROVED` reservations consume capacity.

`PENDING` reservations are visible but do not block capacity.

## Hard rules

### Reservation approval

A reservation is final only after a manager approves it.

Until then, it remains `PENDING`.

### Pending behavior

Pending reservations must be visible in the calendar, preferably with lighter styling.

Pending reservations must not prevent other users from submitting requests for the same time.

### Capacity behavior

When approving a reservation, check confirmed capacity again.

Approval must fail if any hourly slot in the requested range is already full.

Do the approval and capacity check in a backend transaction.

### Time rules

- Reservations are hourly.
- Start time must be on the hour.
- End time must be on the hour.
- Minimum reservation length is 1 hour.
- Maximum reservation length is one working day.
- A reservation cannot span multiple calendar days.

### Working schedule

Working days and hours must be configurable.

Support weekly schedule and date-specific exceptions.

### Excluded features

Do not implement unless explicitly requested:

- Check-in
- Check-out
- No-show
- Penalties
- User quota system
- Automatic priority engine
- Physical device assignment

## Recommended tech stack

Use:

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Prisma
- SQLite
- Zod
- Auth.js / NextAuth credentials, or a simple secure cookie session

Do not add unnecessary services, message queues, microservices, event buses, or complex infrastructure.

## Code quality expectations

- TypeScript strict mode should be enabled.
- Use server-side validation for all mutations.
- Use Zod schemas for form/API validation.
- Keep business logic out of UI components.
- Put reservation validation and capacity logic in reusable service functions.
- Do not duplicate capacity-check logic in multiple places.
- Use clear names over clever abstractions.
- Add comments only where the business rule is non-obvious.
- Keep components small but do not over-split prematurely.

## Suggested folder structure

```text
.
├── app/
│   ├── login/
│   ├── dashboard/
│   ├── reservations/
│   ├── manager/
│   ├── admin/
│   └── api/
├── components/
│   ├── ui/
│   ├── calendar/
│   ├── reservation/
│   └── admin/
├── lib/
│   ├── auth.ts
│   ├── db.ts
│   ├── permissions.ts
│   ├── time.ts
│   ├── schedule.ts
│   ├── reservation-service.ts
│   ├── capacity-service.ts
│   └── audit.ts
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── scripts/
├── tests/
├── .env.example
└── README.md
```

## Database entities

Use these entities unless there is a strong reason to change them.

### User

Fields:

- id
- name
- email
- passwordHash
- role: `USER | MANAGER | ADMIN`
- active
- createdAt
- updatedAt

### ResourcePool

Fields:

- id
- name
- capacity
- active
- createdAt
- updatedAt

Usually there will be one row:

```text
Company Systems, capacity 5
```

### WorkingSchedule

Fields:

- id
- dayOfWeek
- isWorkingDay
- startTime
- endTime

Use dayOfWeek consistently. Prefer 0–6 or 1–7 and document it in code.

### ScheduleException

Fields:

- id
- date
- isWorkingDay
- startTime nullable
- endTime nullable
- reason nullable

This overrides the weekly schedule for a specific date.

### Reservation

Fields:

- id
- userId
- resourcePoolId
- startAt
- endAt
- status
- reason nullable
- rejectionReason nullable
- approvedById nullable
- approvedAt nullable
- cancelledById nullable
- cancelledAt nullable
- createdAt
- updatedAt

Statuses:

- `PENDING`
- `APPROVED`
- `REJECTED`
- `CANCELLED_BY_USER`
- `CANCELLED_BY_ADMIN`
- `ALTERNATIVE_PROPOSED`

### ReservationAlternative

Fields:

- id
- reservationId
- proposedStartAt
- proposedEndAt
- proposedById
- status
- respondedAt nullable
- createdAt
- updatedAt

Statuses:

- `PROPOSED`
- `ACCEPTED`
- `REJECTED`
- `EXPIRED`

### AuditLog

Fields:

- id
- actorUserId nullable
- entityType
- entityId
- action
- oldValue JSON nullable
- newValue JSON nullable
- createdAt

## Required service functions

Implement business logic in service modules.

### schedule service

Required functions:

```ts
getWorkingWindowForDate(date: Date): Promise<{
  isWorkingDay: boolean
  startTime: string | null
  endTime: string | null
}>
```

```ts
validateReservationTimeRange(input: {
  startAt: Date
  endAt: Date
}): Promise<void>
```

Validation must check:

- hourly boundaries
- same calendar day
- minimum 1 hour
- within configured working hours
- working day is enabled

### capacity service

Required functions:

```ts
getSlotUsage(input: {
  resourcePoolId: string
  startAt: Date
  endAt: Date
}): Promise<Array<{
  slotStart: Date
  slotEnd: Date
  approvedCount: number
  pendingCount: number
  capacity: number
}>>
```

```ts
assertCapacityAvailableForApproval(input: {
  resourcePoolId: string
  startAt: Date
  endAt: Date
  excludeReservationId?: string
}): Promise<void>
```

### reservation service

Required functions:

```ts
createReservationRequest(input: {
  userId: string
  resourcePoolId: string
  startAt: Date
  endAt: Date
  reason?: string
})
```

```ts
approveReservation(input: {
  reservationId: string
  managerId: string
})
```

```ts
rejectReservation(input: {
  reservationId: string
  managerId: string
  rejectionReason?: string
})
```

```ts
cancelReservationByUser(input: {
  reservationId: string
  userId: string
})
```

```ts
cancelReservationByAdmin(input: {
  reservationId: string
  adminId: string
  reason?: string
})
```

```ts
proposeAlternative(input: {
  reservationId: string
  managerId: string
  proposedStartAt: Date
  proposedEndAt: Date
})
```

```ts
acceptAlternative(input: {
  alternativeId: string
  userId: string
})
```

```ts
rejectAlternative(input: {
  alternativeId: string
  userId: string
})
```

## Status transition rules

Allowed transitions:

```text
PENDING -> APPROVED
PENDING -> REJECTED
PENDING -> CANCELLED_BY_USER
PENDING -> ALTERNATIVE_PROPOSED

ALTERNATIVE_PROPOSED -> APPROVED
ALTERNATIVE_PROPOSED -> REJECTED
ALTERNATIVE_PROPOSED -> CANCELLED_BY_USER

APPROVED -> CANCELLED_BY_ADMIN
APPROVED -> CANCELLED_BY_USER, if product owner allows it
```

Do not allow arbitrary status changes.

## Calendar behavior

Calendar should show:

- Approved count per hour
- Pending count per hour
- Capacity per hour
- Available approved capacity per hour

User view should not necessarily expose all user names.

Manager/admin view can show requester names.

## Permission rules

- USER can see own reservation details.
- USER can see aggregated calendar capacity.
- MANAGER can see all reservations and requester names.
- ADMIN can manage users, capacity, and schedules.
- Only MANAGER or ADMIN can approve/reject/propose alternatives.
- Only ADMIN can change capacity and working schedule.

## Audit log rules

Create audit logs for:

- Reservation created
- Reservation approved
- Reservation rejected
- Reservation cancelled
- Alternative proposed
- Alternative accepted/rejected
- Capacity changed
- Working schedule changed
- Schedule exception created/updated/deleted
- User role changed

## Notification rules

For the first operational version, implement simple in-app notification records or email placeholders.

Required notification events:

- New pending reservation to managers
- Approved reservation to user
- Rejected reservation to user
- Alternative proposed to user
- Alternative accepted/rejected to manager
- Reservation cancelled to affected party

If real email is too much for the phase, create the notification table and display notifications inside the app.

## Testing requirements

At minimum, test these business rules:

1. Pending reservations do not consume capacity.
2. Approved reservations consume capacity.
3. Approval fails when any requested hour is full.
4. Reservation cannot be outside working hours.
5. Reservation cannot span multiple days.
6. Reservation must start and end on exact hours.
7. User cannot approve own request unless they are manager/admin.
8. Admin can change capacity only if it does not invalidate future approved reservations, or the app clearly marks overbooked. Prefer preventing invalid capacity reduction for now.

## Implementation discipline

When asked to implement a phase:

1. Read this AGENTS.md.
2. Read PHASES.md.
3. Implement only the requested phase.
4. Do not silently skip required business rules.
5. Do not introduce out-of-scope features.
6. After coding, list:
   - files changed
   - commands to run
   - manual test steps
   - known limitations

## Definition of done for each phase

A phase is done only when:

- App builds successfully.
- TypeScript has no errors.
- Database migrations are updated if schema changed.
- Main happy path for that phase works manually.
- Critical business rules for that phase are enforced server-side.
- README or setup notes are updated if commands changed.
