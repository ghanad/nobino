# AGENTS.md

Compact project instructions for coding agents. Read this before changing code.

## Product

Nobino is a small internal reservation app for about 5-6 identical company systems and about 50 users.

Model systems as one capacity-based `ResourcePool`, not as physical devices. A reservation consumes one unit of capacity for an hourly time range.

## Non-Negotiable Rules

- Reservations start as `PENDING`; final use requires manager/admin approval.
- Only `APPROVED` reservations consume capacity.
- `PENDING` reservations are visible in calendars but must not block new requests.
- Approval must re-check approved capacity inside a backend transaction and fail if any requested hour is full.
- Reservation start/end must be on exact hours.
- Minimum duration is 1 hour.
- Maximum duration is one configured working day.
- Reservations cannot span multiple calendar days.
- Working days/hours and date-specific exceptions must remain configurable.
- All user-facing reservation dates, date inputs, calendar navigation, URL date params, and visible date formatting must use Persian/Jalali dates.
- Visible Jalali date labels should use natural Persian order: weekday when useful, then day, month, year; for example `پنج شنبه ۳۱ اردیبهشت ۱۴۰۵`. If weekday is not useful, use `۳۱ اردیبهشت ۱۴۰۵`.
- Do not use browser-native Gregorian date pickers for product date input.

## Out Of Scope Unless Explicitly Requested

- Check-in/check-out
- No-show tracking
- Penalties
- User quota system
- Automatic priority engine
- Physical device assignment
- Queues, microservices, event buses, or other large-product infrastructure

## Stack And Architecture

- Next.js App Router
- TypeScript strict mode
- Tailwind CSS and shadcn/ui-compatible components
- Prisma with SQLite
- Zod for server-side validation
- Simple signed HTTP-only cookie session auth

Keep business rules out of UI components. Put reservation validation, schedule logic, capacity checks, permissions, notifications, and audit behavior in reusable `lib/*` services.

Important files:

- `lib/schedule.ts`: working window and reservation time validation
- `lib/capacity-service.ts`: slot usage and capacity assertions
- `lib/reservation-service.ts`: reservation transitions and alternative handling
- `lib/admin-settings-service.ts`: capacity, schedule, exceptions, and users
- `lib/jalali-date.ts`: Jalali/Gregorian boundary conversion
- `tests/business-rules.test.ts`: critical business-rule coverage
- `README.md`: setup, routes, operational notes, and current status

## Permissions

- `USER`: own reservation details, aggregate calendar capacity, create/cancel own pending requests, respond to alternatives.
- `MANAGER`: all reservations with requester names, approve/reject/propose alternatives, cancel when allowed.
- `ADMIN`: manager permissions plus users, capacity, schedules, exceptions, and audit history.

Only manager/admin users may approve, reject, or propose alternatives. Only admins may change capacity, users, working schedules, or schedule exceptions.

## Audit And Notifications

Keep audit logs for reservation creation/approval/rejection/cancellation, alternatives, capacity changes, schedule changes, schedule exceptions, and user role/status changes.

Keep in-app notifications for pending requests, approvals, rejections, alternatives, alternative responses, and cancellations.

## Required Checks Before Finishing

For code changes, run the smallest relevant checks:

```bash
npm run typecheck
npm run test
npm run build
```

For docs-only changes, typecheck/build are not required.

## Implementation Discipline

- Make the smallest production-usable change that satisfies the request.
- Do not add out-of-scope features.
- Do not duplicate capacity logic.
- Use clear names over clever abstractions.
- Add comments only for non-obvious business rules.
- Preserve unrelated user changes in the worktree.
- After coding, report files changed, commands run, manual test steps, and known limitations.



## RTK Usage

For all noisy terminal commands and large outputs, always use RTK wrappers.

Examples:

* use `rtk git diff` instead of `git diff`
* use `rtk git status`
* use `rtk test go test ./...`
* use `rtk grep`
* use `rtk find`
* use `rtk docker logs`
* use `rtk kubectl logs`

Never dump large raw terminal outputs directly into context when RTK can summarize them.

