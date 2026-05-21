# PHASES.md

## How to use this file with a coding LLM

Give the coding LLM one phase at a time.

Recommended prompt:

```text
Read AGENTS.md and PHASES.md.
Implement Phase X only.
Do not implement later phases.
After finishing, provide:
1. summary of changes
2. files changed
3. commands to run
4. manual test steps
5. known limitations
```

Do not ask the LLM to implement everything at once.

The goal is to get an operational internal tool quickly, then improve it.

---

# Phase 0 — Project bootstrap

## Goal

Create the base application.

## Tasks

- Create Next.js app with TypeScript.
- Add Tailwind CSS.
- Add shadcn/ui setup.
- Add Prisma.
- Configure Prisma with SQLite.
- Add `.env.example`.
- Add basic README setup instructions.
- Add health/check page or simple homepage.
- Enable TypeScript strict mode.
- Add basic lint/build scripts.

## Acceptance criteria

- `npm install` works.
- `npx prisma db push` or migration command works.
- `npm run dev` starts the app.
- Homepage renders.

---

# Phase 1 — Database schema and seed data

## Goal

Create the core data model.

## Tasks

Implement Prisma schema for:

- User
- ResourcePool
- WorkingSchedule
- ScheduleException
- Reservation
- ReservationAlternative
- AuditLog
- Notification, if implementing in-app notifications early

Add enums:

- UserRole
- ReservationStatus
- AlternativeStatus

Add seed script:

- Admin user
- Manager user
- Normal user
- One resource pool with capacity 5
- Default weekly schedule

Default schedule:

- Saturday: 09:00–17:00
- Sunday: 09:00–17:00
- Monday: 09:00–17:00
- Tuesday: 09:00–17:00
- Wednesday: 09:00–17:00
- Thursday: 09:00–17:00
- Friday: disabled

## Acceptance criteria

- Database schema migrates successfully.
- Seed script creates usable users and default settings.
- Resource pool exists.
- Weekly schedule exists.

---

# Phase 2 — Authentication and roles

## Goal

Users can log in and the app can enforce roles.

## Tasks

- Implement email/password login.
- Hash passwords securely.
- Add session handling.
- Add logout.
- Add current-user helper.
- Add role-check helpers.
- Protect authenticated routes.
- Create basic layouts for:
  - user dashboard
  - manager area
  - admin area

## Acceptance criteria

- Seeded admin can log in.
- Seeded manager can log in.
- Seeded user can log in.
- Unauthenticated users cannot access protected pages.
- Normal user cannot access admin pages.
- Manager cannot access admin settings unless explicitly allowed.
- Admin can access all areas.

---

# Phase 3 — Working schedule logic

## Goal

Implement configurable working days and hours.

## Tasks

- Implement schedule service.
- Implement weekly schedule retrieval.
- Implement date exception override logic.
- Implement validation for:
  - working day
  - inside working hours
  - exact hourly start/end
  - same calendar day
  - minimum 1 hour
  - maximum one working day

## Acceptance criteria

- Reservation time validation works server-side.
- Friday is rejected by default.
- Enabled Friday exception allows reservations.
- Disabled working day exception blocks reservations.
- 09:30–10:30 is rejected.
- 09:00–17:00 is accepted on a valid working day.
- 08:00–10:00 is rejected if working hours start at 09:00.

---

# Phase 4 — Reservation request creation

## Goal

Users can create pending reservation requests.

## Tasks

- Build create reservation form:
  - date
  - start hour
  - end hour
  - optional reason
- Implement backend action/API for request creation.
- Validate all time rules server-side.
- Store request as `PENDING`.
- Create audit log.
- Create notification for managers, or a placeholder event if notification UI is later.

## Important rule

Do not block creation because of other pending reservations.

For the first version, it is acceptable to block creation if the slot is already fully approved, but this must be clearly implemented as a product choice.

Recommended first behavior:

- If approved capacity is already full for any requested hour, do not allow new requests for that range.
- Pending requests still do not block anything.

## Acceptance criteria

- User can create valid reservation request.
- Invalid time ranges are rejected.
- Request appears as `PENDING`.
- Pending requests do not consume capacity.
- Audit log is created.

---

# Phase 5 — Calendar / capacity view

## Goal

Users and managers can see availability.

## Tasks

- Implement slot usage service.
- Show daily view.
- Show weekly view if quick enough; otherwise daily view is enough for first operation.
- For each slot show:
  - approved count
  - pending count
  - total capacity
  - available confirmed capacity
- Pending should be visually lighter than approved.
- User view should show aggregate counts.
- Manager view may show requester details.

## Acceptance criteria

- Calendar shows hourly slots.
- Approved and pending counts are different.
- Full slots are clearly shown.
- Pending slots are visible but not treated as confirmed.
- Calendar updates after new request creation.

---

# Phase 6 — Manager approval queue

## Goal

Managers can approve, reject, or propose alternatives.

## Tasks

- Create manager queue page.
- List pending requests.
- Show request details:
  - user
  - date
  - start/end
  - duration
  - reason
  - slot capacity summary
- Implement approve action.
- Implement reject action with optional reason.
- Implement propose alternative action.

## Critical rule

Approval must check capacity inside a database transaction.

If the requested range is full at approval time, approval must fail with a clear message.

## Acceptance criteria

- Manager can approve pending request.
- Approved reservation consumes capacity.
- Manager cannot approve beyond capacity.
- Manager can reject with reason.
- Manager can propose alternative time.
- Audit logs are created.
- Notifications are created or placeholder events are recorded.

---

# Phase 7 — My reservations and alternative handling

## Goal

Users can track their own requests and respond to alternatives.

## Tasks

- Create "My Reservations" page.
- Show reservations by status.
- Show rejection reasons.
- Show alternative proposals.
- User can accept alternative.
- User can reject alternative.
- User can cancel own pending request.

## Acceptance criteria

- User sees own reservations only.
- User cannot see another user's detailed reservation page.
- User can accept proposed alternative.
- Accepting alternative checks capacity.
- If capacity is available, reservation becomes approved.
- If capacity is not available, a clear error appears.
- User can reject alternative.
- User can cancel pending request.

---

# Phase 8 — Admin capacity and schedule settings

## Goal

Admin can configure the system without code changes.

## Tasks

- Admin can view and edit resource pool capacity.
- Admin can activate/deactivate resource pool.
- Admin can edit weekly working schedule.
- Admin can create/edit/delete schedule exceptions.
- Add guard for reducing capacity:
  - Prefer preventing reduction below future approved reservations.
  - Show clear message explaining the blocking slots.

## Acceptance criteria

- Admin can change capacity.
- Admin cannot accidentally invalidate future approved reservations.
- Admin can enable Friday for a specific date.
- Admin can disable a normal working day.
- Admin can change Thursday hours, for example 10:00–15:00.
- All changes are audit logged.

---

# Phase 9 — Users management

## Goal

Admin can manage up to around 50 users without database access.

## Tasks

- Admin can list users.
- Admin can create user.
- Admin can edit name and role.
- Admin can activate/deactivate user.
- Admin can reset password or set temporary password.
- Prevent admin from disabling their own account accidentally.

## Acceptance criteria

- Admin can create a normal user.
- Admin can create a manager.
- Deactivated users cannot log in.
- Role changes take effect.
- User changes are audit logged.

---

# Phase 10 — Notifications

## Goal

Users and managers do not need to constantly refresh pages.

## Tasks

Implement simple in-app notifications first.

Notification events:

- New pending reservation to managers
- Reservation approved to user
- Reservation rejected to user
- Alternative proposed to user
- Alternative accepted/rejected to manager
- Reservation cancelled to affected party

Optional:

- Email notifications using SMTP if credentials are available.

## Acceptance criteria

- Notifications are created for main events.
- User can see unread notifications.
- User can mark notifications as read.
- Manager receives notification when new request is created.
- User receives notification when request is approved/rejected.

---

# Phase 11 — Audit log viewer

## Goal

Admins can inspect important changes.

## Tasks

- Admin audit log page.
- Filters:
  - actor
  - entity type
  - action
  - date range
- Show old/new values where useful.

## Acceptance criteria

- Admin can see reservation approval history.
- Admin can see capacity changes.
- Admin can see schedule changes.
- Normal users cannot access audit log.

---

# Phase 12 — Operational hardening

## Goal

Make the app safe enough for real internal use.

## Tasks

- Improve error messages.
- Add loading states.
- Add empty states.
- Add basic automated tests for business logic.
- Add production build verification.
- Add Dockerfile if deployment needs it.
- Add backup notes for SQLite database files.
- Add environment variable documentation.
- Add timezone handling notes.
- Review security basics:
  - password hashing
  - session cookie settings
  - role checks
  - server-side validation

## Acceptance criteria

- `npm run build` passes.
- Core business rule tests pass.
- App can be deployed using documented steps.
- Admin can recover basic operational state.
- README has setup and production notes.

---

# Phase 13 — Small polish after real usage

## Goal

Improve usability after the first few days of use.

## Tasks

Pick based on actual complaints.

Possible improvements:

- Weekly calendar view
- Persian/Jalali date display if needed
- Better manager filtering
- Export reservations to CSV
- Email reminders
- Public display screen for today's bookings
- Better mobile layout
- Bulk approve/reject
- Search users
- Reservation comments

## Acceptance criteria

Define based on selected improvement.

Do not implement all polish features blindly.
