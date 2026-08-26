---
version: 1
slug: "app-admin-users-userid-page-tsx"
primary_target: "app/admin/users/[userId]/page.tsx"
related_targets: []
---

# Surface: admin user detail (`app/admin/users/[userId]/page.tsx`)

## Scope and mode

- Admin-only user detail route; mode: **Operate** (admin completes management tasks).
- Redesign (2026-08): composition replaced, behavior preserved. Locked wireframe «نوار هویت و دو ستون» (identity band + asymmetric split), seed key 80dbb3bf, dealt structure 7.

## Audience and job

- Firm administrators (~a handful) managing one employee's account: review identity/status at a glance, edit name/role/access flags, manage team memberships, set a temp password, soft-delete (never their own account).
- Task frequency: occasional; all tasks roughly equal weight (balanced mix).

## Chosen direction

- Slim identity band (role/status badges, LTR email, Jalali created date) under the page header; main column (RTL right) holds profile+access form (content-sized inputs, hairline-separated permission rows) and temp-password form; sticky side column (RTL left) holds teams and the danger zone.
- Density is the thesis: no full-width inputs, no nested cards, flat at rest, blue only for actions.

## Constraints

- All form actions, field names, guards (self-delete/self-deactivate), Jalali dates, and Persian RTL copy are behavior and must not change.

## Unresolved decisions

- None. Non-blocking notes from finish review: MANAGER badge keeps blue tone (semantic-role reading vs One-Action-Color rule); `size="sm"` controls sit under 44px touch target on mobile (acceptable for desktop-first admin surface).
