# IMPLEMENTATION_NOTES.md

## Recommended first operational target

The app should become usable after roughly these phases:

- Phase 0: bootstrap
- Phase 1: schema and seed
- Phase 2: auth
- Phase 3: schedule validation
- Phase 4: create reservation
- Phase 5: calendar
- Phase 6: manager approval

At that point, the company can start using the system manually.

Phases 7–12 improve self-service, admin control, notifications, and operational safety.

## Keep the first deployment small

Do not overbuild.

For 5–6 systems and around 50 users, these are enough:

- one PostgreSQL database
- one Next.js app
- one resource pool
- admin-managed users
- simple manager approval queue
- simple daily calendar

## Timezone

Pick one application timezone and keep it consistent.

Recommended:

- Store timestamps in UTC.
- Display times in the company timezone.
- Validate working hours using the company timezone.

Document the timezone in `.env.example`, for example:

```text
APP_TIMEZONE=Asia/Tehran
```

or another company timezone.

## Persian/Jalali date

Do not block the first version on Jalali calendar.

First version can use Gregorian dates if faster.

Add Persian/Jalali display later if users need it.

## Concurrency

The most important race condition is approval.

Two managers might approve overlapping requests at nearly the same time.

The approval function must check capacity inside a database transaction.

For this small app, this is usually enough if implemented carefully.

## Capacity reduction

When admin reduces capacity, prefer this simple rule:

Do not allow capacity to be reduced below existing future approved usage.

Example:

If any future slot already has 5 approved reservations, capacity cannot be reduced to 4.

Show the blocking date/time to admin.

## Visibility

Recommended first behavior:

- Normal users see aggregate counts.
- Managers/admins see requester names.

This avoids unnecessary exposure while keeping the system useful.

## Reservation cancellation

Recommended first behavior:

- User can cancel own pending request.
- Manager/admin can cancel any pending or approved reservation.
- User cancellation of approved reservations can be added if product owner wants it.

## Notifications

If email is not ready, use in-app notifications first.

The key is that managers can see new pending requests and users can see decisions.

## What not to do

Avoid these in the first implementation:

- microservices
- queues
- Kubernetes
- complex permission matrix
- dynamic resource categories
- physical device inventory
- check-in/no-show workflow
- external calendar sync
- full audit compliance system
- complex recurring reservations

The app should solve the reservation problem quickly.
